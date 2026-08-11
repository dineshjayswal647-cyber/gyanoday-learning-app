const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory store for active OTP codes: { phone: { otp, expires } }
const activeOTPs = {};

// Detect local IP Address to show Mobile Link
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Initialize Database File if not exists
function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [
        // Default Admin Account
        {
          phone: "9838691892",
          name: "दिनेश जायसवाल (Admin)",
          role: "admin",
          password: "12345629",
          email: "dinesh@djacademy.com"
        }
      ],
      customChapters: {}, 
      notifications: [
        {
          id: 1,
          type: "system",
          text: "DJ Academy सर्वर सफलतापूर्वक चालू हो गया है!",
          date: new Date().toLocaleString('hi-IN')
        }
      ],
      settings: {
        webhookUrl: ""
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Read database
function readDB() {
  initDB();
  const data = fs.readFileSync(DB_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  if (parsed.liveClass === undefined) {
    parsed.liveClass = null;
    fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
  }
  if (parsed.schedule === undefined) {
    parsed.schedule = [
      { id: "mon", dayName: "सोमवार (Monday)", status: "Active", time: "06:00 PM", subject: "गणित (Maths)", topic: "संख्या पद्धति" },
      { id: "tue", dayName: "मंगलवार (Tuesday)", status: "Active", time: "06:00 PM", subject: "विज्ञान (Science)", topic: "रासायनिक अभिक्रियाएं" },
      { id: "wed", dayName: "बुधवार (Wednesday)", status: "Active", time: "06:00 PM", subject: "गणित (Maths)", topic: "त्रिकोणमिति" },
      { id: "thu", dayName: "गुरुवार (Thursday)", status: "Active", time: "06:00 PM", subject: "विज्ञान (Science)", topic: "अम्ल, क्षारक एवं लवण" },
      { id: "fri", dayName: "शुक्रवार (Friday)", status: "Active", time: "06:00 PM", subject: "गणित (Maths)", topic: "दो चरों वाले रैखिक समीकरण" },
      { id: "sat", dayName: "शनिवार (Saturday)", status: "Active", time: "06:00 PM", subject: "विज्ञान (Science)", topic: "बोर्ड महत्वपूर्ण प्रश्न" },
      { id: "sun", dayName: "रविवार (Sunday)", status: "Cancelled", time: "---", subject: "---", topic: "साप्ताहिक अवकाश (Holiday)" }
    ];
    fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
  }
  if (parsed.quizzes === undefined) {
    parsed.quizzes = [];
    fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
  }
  return parsed;
}

// Write database
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper to send Discord Webhook notification
function sendWebhookNotification(payload) {
  const db = readDB();
  const webhookUrl = db.settings.webhookUrl;
  if (!webhookUrl) return;

  let postData = '';
  if (typeof payload === 'object') {
    postData = JSON.stringify(payload);
  } else {
    postData = JSON.stringify({
      content: `🔔 **DJ Academy Alert:** ${payload}`
    });
  }

  const urlData = new URL(webhookUrl);
  const options = {
    hostname: urlData.hostname,
    path: urlData.pathname + urlData.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {});
  });

  req.on('error', (e) => {
    console.error("Webhook notification failed:", e.message);
  });

  req.write(postData);
  req.end();
}

function sendRichWebhook(title, description, colorHex = "#ff6f00", fields = []) {
  const colorDec = parseInt(colorHex.replace("#", ""), 16);
  const payload = {
    embeds: [{
      title: title,
      description: description,
      color: colorDec,
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "ज्ञानोदय लर्निंग ऐप • लाइव अलर्ट"
      }
    }]
  };
  sendWebhookNotification(payload);
}

// ==========================================================================
// GYANODAY-STYLE AUTHENTICATION ENDPOINTS (PASSWORD & OTP)
// ==========================================================================

// 1. Password-based Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "कृपया यूजरनेम/मोबाइल और पासवर्ड दर्ज करें।" });
  }

  const db = readDB();
  // Find user by phone OR email
  const user = db.users.find(u => u.phone === username || u.email === username);

  if (!user) {
    return res.status(401).json({ error: "यूजर नहीं मिला! कृपया रजिस्ट्रेशन करें।" });
  }

  // Password matching
  if (user.password !== password) {
    return res.status(401).json({ error: "गलत पासवर्ड! कृपया सही पासवर्ड डालें।" });
  }

  // Login success log (only for students, ignore admin to prevent cluttering)
  if (user.role !== 'admin') {
    const loginLog = `${user.role === 'admin' ? 'शिक्षक' : 'छात्र'} "${user.name}" ने पासवर्ड से लॉगिन किया।`;
    db.notifications.unshift({
      id: Date.now(),
      type: "login",
      text: loginLog,
      date: new Date().toLocaleString('hi-IN')
    });
    writeDB(db);
    sendRichWebhook("🔑 छात्र लॉगिन (User Login)", `छात्र **${user.name}** ने सफलतापूर्वक लॉगिन किया।`, "#4caf50", [
      { name: "👤 नाम (Name)", value: user.name, inline: true },
      { name: "📱 मोबाइल (Mobile)", value: user.phone, inline: true }
    ]);
  }

  res.status(200).json({
    message: "लॉगिन सफल!",
    user: { name: user.name, phone: user.phone, role: user.role, email: user.email, photo: user.photo || "" }
  });
});

// 2. Password-based Registration
app.post('/api/auth/register', (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: "नाम, मोबाइल नंबर और पासवर्ड आवश्यक हैं।" });
  }

  const db = readDB();
  
  // Check if number already registered
  const numExists = db.users.some(u => u.phone === phone);
  if (numExists) {
    return res.status(400).json({ error: "यह मोबाइल नंबर पहले से रजिस्टर्ड है।" });
  }

  const newUser = {
    name,
    phone,
    email: email || "",
    password,
    role: "student",
    photo: "",
    enrolledDate: new Date().toLocaleDateString('hi-IN')
  };

  db.users.push(newUser);

  // Install Log alert
  const logText = `नए छात्र "${name}" (मोबाइल: ${phone}) ने प्रोफाइल रजिस्टर की! 🎓🎉`;
  db.notifications.unshift({
    id: Date.now(),
    type: "register",
    text: logText,
    date: new Date().toLocaleString('hi-IN')
  });
  writeDB(db);

  sendRichWebhook("🎓 नया रजिस्ट्रेशन (New Registration)", `एक नए छात्र ने ऐप पर प्रोफाइल बनाई है!`, "#ff6f00", [
    { name: "👤 नाम (Name)", value: name, inline: true },
    { name: "📱 मोबाइल (Mobile)", value: phone, inline: true }
  ]);

  res.status(201).json({
    message: "रजिस्ट्रेशन सफल!",
    user: { name: newUser.name, phone: newUser.phone, role: newUser.role, email: newUser.email, photo: newUser.photo }
  });
});

// Update user profile photo
app.post('/api/user/update-photo', (req, res) => {
  const { phone, photo } = req.body;
  if (!phone || !photo) {
    return res.status(400).json({ error: "मोबाइल नंबर और फोटो आवश्यक हैं।" });
  }

  const db = readDB();
  const user = db.users.find(u => u.phone === phone);
  if (user) {
    user.photo = photo;
    writeDB(db);
    return res.status(200).json({ message: "प्रोफ़ाइल फ़ोटो सफलतापूर्वक अपडेट की गई।" });
  }
  res.status(404).json({ error: "यूज़र नहीं मिला।" });
});

// Retrieve latest user profile data
app.get('/api/user/profile', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: "मोबाइल नंबर आवश्यक है।" });
  }

  const db = readDB();
  const user = db.users.find(u => u.phone === phone);
  if (user) {
    return res.status(200).json({
      name: user.name,
      phone: user.phone,
      role: user.role,
      email: user.email || "",
      photo: user.photo || ""
    });
  }
  res.status(404).json({ error: "यूज़र नहीं मिला।" });
});

// 3. Send OTP
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10) {
    return res.status(400).json({ error: "कृपया वैध 10-अंकीय मोबाइल नंबर डालें।" });
  }

  // Generate 4-digit code
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  activeOTPs[phone] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  };

  const db = readDB();
  const userExists = db.users.some(u => u.phone === phone);

  console.log(`[OTP SENT] Mobile: ${phone} | OTP: ${otp} | Exists: ${userExists}`);
  sendRichWebhook("💬 OTP वेरिफिकेशन लॉग", `मोबाइल **${phone}** के लिए OTP कोड जनरेट किया गया।`, "#ffeb3b", [
    { name: "📱 मोबाइल", value: phone, inline: true },
    { name: "🔑 OTP कोड", value: `**${otp}**`, inline: true }
  ]);

  const responseData = {
    message: "OTP सफलतापूर्वक भेजा गया!",
    exists: userExists
  };

  const apiKey = db.settings ? db.settings.smsApiKey : "";
  if (apiKey) {
    // Send real SMS via Fast2SMS bulkV2 API (using standard https module)
    const https = require('https');
    
    const senderId = db.settings.smsSenderId;
    const templateId = db.settings.smsTemplateId;
    
    let url = "";
    if (senderId && templateId) {
      // DLT SMS route (compliant with TRAI regulations in India)
      url = `https://www.fast2sms.com/dev/bulkV2?sender_id=${encodeURIComponent(senderId)}&message=${encodeURIComponent(templateId)}&variables_values=${otp}&route=dlt&numbers=${phone}`;
    } else {
      // Standard Quick SMS route fallback
      url = `https://www.fast2sms.com/dev/bulkV2?variables_values=${otp}&route=otp&numbers=${phone}`;
    }

    const options = {
      headers: {
        'Authorization': apiKey
      }
    };
    
    https.get(url, options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        console.log("Fast2SMS DLT API Response:", data);
      });
    }).on('error', (err) => {
      console.error("Fast2SMS DLT API Error:", err);
    });
  } else {
    // Expose OTP only if no real SMS API key is configured (mock development mode)
    responseData.otp = otp;
  }

  res.status(200).json(responseData);
});

// 4. Verify OTP and login
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: "मोबाइल नंबर और OTP आवश्यक हैं।" });
  }

  // Backdoor checks for admin / testing
  if (phone === "9838691892" && otp === "9999") {
    const db = readDB();
    const admin = db.users.find(u => u.phone === phone);
    return res.status(200).json({
      message: "एडमिन लॉगिन सफल!",
      user: { name: admin.name, phone: admin.phone, role: admin.role, email: admin.email },
      isNewUser: false
    });
  }

  const record = activeOTPs[phone];
  if (!record) {
    return res.status(400).json({ error: "सत्यापन कोड एक्सपायर हो गया है या भेजा नहीं गया।" });
  }

  if (Date.now() > record.expires) {
    delete activeOTPs[phone];
    return res.status(400).json({ error: "यह OTP समय समाप्त हो चुका है। कृपया नया भेजें।" });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ error: "गलत OTP कोड!" });
  }

  // OTP verified!
  delete activeOTPs[phone];

  const db = readDB();
  const user = db.users.find(u => u.phone === phone);

  if (user) {
    // Existing user logs in (skip notification if admin)
    if (user.role !== 'admin') {
      const loginLog = `छात्र "${user.name}" ने OTP द्वारा लॉगिन किया।`;
      db.notifications.unshift({
        id: Date.now(),
        type: "login",
        text: loginLog,
        date: new Date().toLocaleString('hi-IN')
      });
      writeDB(db);
    }

    res.status(200).json({
      message: "लॉगिन सफल!",
      user: { name: user.name, phone: user.phone, role: user.role, email: user.email },
      isNewUser: false
    });
  } else {
    // New user registers through OTP -> redirects to profile creation
    res.status(200).json({
      message: "OTP सत्यापित! कृपया नाम और पासवर्ड डालें।",
      isNewUser: true
    });
  }
});

// ==========================================================================
// LIVE CLASSROOM MANAGEMENT ENDPOINTS
// ==========================================================================

// Get current live class status
app.get('/api/live/status', (req, res) => {
  const db = readDB();
  res.status(200).json(db.liveClass || { isActive: false });
});

// Start Live Class (Admin Only)
app.post('/api/admin/live/start', (req, res) => {
  const { subjectId, title, videoId, enableSimulation } = req.body;
  if (!subjectId || !title || !videoId) {
    return res.status(400).json({ error: "सभी फ़ील्ड्स (विषय, शीर्षक, यूट्यूब ID) आवश्यक हैं।" });
  }

  const db = readDB();
  
  db.liveClass = {
    isActive: true,
    subject: subjectId,
    title: title,
    videoId: videoId,
    enableSimulation: !!enableSimulation,
    watchingCount: Math.floor(10 + Math.random() * 15), // realistic start count
    messages: [
      { sender: "System", text: "लाइव क्लास शुरू हो चुकी है। सभी छात्रों का स्वागत है! 🔴", date: new Date().toLocaleTimeString() }
    ]
  };

  const notifyText = `🔴 दिनेश सर लाइव आ चुके हैं! विषय: "${title}" | अभी ज्वाइन करें!`;
  db.notifications.unshift({
    id: Date.now(),
    type: "upload",
    text: notifyText,
    date: new Date().toLocaleString('hi-IN')
  });

  writeDB(db);
  sendRichWebhook("🔴 लाइव क्लास शुरू! (Live Class Started)", `दिनेश सर अभी लाइव पढ़ा रहे हैं!`, "#f44336", [
    { name: "📚 विषय (Subject)", value: title, inline: false },
    { name: "📺 यूट्यूब वीडियो आईडी (YouTube ID)", value: videoId, inline: true }
  ]);

  res.status(200).json({ message: "लाइव क्लास सफलतापूर्वक शुरू कर दी गई है!", liveClass: db.liveClass });
});

// Stop Live Class (Admin Only)
app.post('/api/admin/live/stop', (req, res) => {
  const db = readDB();
  db.liveClass = null;
  writeDB(db);
  res.status(200).json({ message: "लाइव क्लास बंद कर दी गई है।" });
});

// Send Chat Message during Live Class
app.post('/api/live/chat', (req, res) => {
  const { sender, text } = req.body;
  if (!sender || !text) return res.status(400).json({ error: "विवरण गायब हैं।" });

  const db = readDB();
  if (!db.liveClass || !db.liveClass.isActive) {
    return res.status(400).json({ error: "फिलहाल कोई लाइव क्लास सक्रिय नहीं है।" });
  }

  const newMsg = {
    sender,
    text,
    date: new Date().toLocaleTimeString()
  };

  db.liveClass.messages.push(newMsg);
  
  // Keep last 50 messages
  if (db.liveClass.messages.length > 50) {
    db.liveClass.messages.shift();
  }

  // Increment watching count dynamically on chat activity
  db.liveClass.watchingCount += Math.floor(Math.random() * 3) - 1;
  if (db.liveClass.watchingCount < 5) db.liveClass.watchingCount = 5;

  writeDB(db);
  res.status(200).json(newMsg);
});

// ==========================================================================
// WEEKLY CLASS SCHEDULE ENDPOINTS
// ==========================================================================

// Get weekly schedule
app.get('/api/schedule', (req, res) => {
  const db = readDB();
  res.status(200).json(db.schedule);
});

// Update specific day schedule (Admin Only)
app.post('/api/admin/schedule', (req, res) => {
  const { dayId, status, time, subject, topic } = req.body;
  if (!dayId || !status) {
    return res.status(400).json({ error: "दिन (Day) और स्थिति (Status) आवश्यक हैं।" });
  }

  const db = readDB();
  const dayIndex = db.schedule.findIndex(d => d.id === dayId);
  if (dayIndex === -1) {
    return res.status(400).json({ error: "अवैध दिन (Invalid Day)" });
  }

  db.schedule[dayIndex] = {
    ...db.schedule[dayIndex],
    status,
    time: status === "Cancelled" ? "---" : (time || "06:00 PM"),
    subject: status === "Cancelled" ? "---" : (subject || "---"),
    topic: status === "Cancelled" ? "साप्य्ताहिक अवकाश (Holiday)" : (topic || "---")
  };

  // Generate a notification for students
  const dayNameStr = db.schedule[dayIndex].dayName.split(' ')[0];
  const notifyText = status === "Cancelled"
    ? `📅 क्लास सूचना: ${dayNameStr} को होने वाली लाइव क्लास स्थगित (छुट्टी) रहेगी।`
    : `📅 शेड्यूल अपडेट: ${dayNameStr} की क्लास शेड्यूल कर दी गई है। विषय: ${subject} (${time})`;

  db.notifications.unshift({
    id: Date.now(),
    type: "system",
    text: notifyText,
    date: new Date().toLocaleString('hi-IN')
  });

  writeDB(db);
  sendRichWebhook("📅 लाइव क्लास शेड्यूल अपडेट", notifyText, "#9c27b0", [
    { name: "📆 दिन (Day)", value: dayNameStr, inline: true },
    { name: "🔔 स्थिति (Status)", value: status === "Cancelled" ? "🔴 Cancelled / छुट्टी" : "🟢 Scheduled", inline: true }
  ]);

  res.status(200).json({ message: "शेड्यूल सफलतापूर्वक अपडेट हो गया!", schedule: db.schedule });
});

// ==========================================================================
// MCQ TEST / QUIZ ENDPOINTS
// ==========================================================================

// Get all custom quizzes
app.get('/api/quizzes', (req, res) => {
  const db = readDB();
  res.status(200).json(db.quizzes || []);
});

// Create a new Mock Test (Admin Only)
app.post('/api/admin/quiz', (req, res) => {
  const { subjectId, title, questions } = req.body;
  if (!subjectId || !title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "सभी विवरण और कम से कम एक प्रश्न आवश्यक हैं।" });
  }

  const db = readDB();
  if (!db.quizzes) db.quizzes = [];

  const newQuiz = {
    id: "quiz-" + Date.now(),
    subjectId,
    title,
    questions: questions.map((q, index) => ({
      id: `q-${Date.now()}-${index}`,
      question: q.question,
      options: q.options, // Array of 4 strings
      correctIndex: parseInt(q.correctIndex), // 0-3
      explanation: q.explanation || ""
    }))
  };

  db.quizzes.push(newQuiz);

  // Generate notification for students
  const subjectMap = {
    "science": "विज्ञान",
    "maths": "गणित",
    "social-science": "सामाजिक विज्ञान",
    "hindi": "हिन्दी",
    "english": "अंग्रेजी"
  };
  const subName = subjectMap[subjectId] || "नया विषय";
  const notifyText = `📝 नया ऑनलाइन मॉक टेस्ट: ${subName} विषय में '${title}' अपलोड कर दिया गया है!`;
  
  db.notifications.unshift({
    id: Date.now(),
    type: "system",
    text: notifyText,
    date: new Date().toLocaleString('hi-IN')
  });

  writeDB(db);
  sendRichWebhook("📝 नया मॉक टेस्ट लाइव! (New Mock Test Live)", notifyText, "#00bcd4", [
    { name: "📚 विषय (Subject)", value: subName, inline: true },
    { name: "📋 टेस्ट नाम (Test Name)", value: title, inline: true }
  ]);

  res.status(200).json({ message: "मॉक टेस्ट सफलतापूर्वक लाइव कर दिया गया है!", quiz: newQuiz });
});
// COURSE MATERIAL & ADMIN CONTROLS ENDPOINTS
// ==========================================================================

app.get('/api/chapters', (req, res) => {
  const db = readDB();
  res.status(200).json(db.customChapters);
});

app.post('/api/admin/upload', (req, res) => {
  const { subjectId, chapterTitle, isNewChapter, chapterId, type, title, videoId, duration, content, pdfData } = req.body;
  
  if (!subjectId || !chapterTitle || !type || !title) {
    return res.status(400).json({ error: "आवश्यक फ़ील्ड्स गायब हैं।" });
  }

  const db = readDB();
  if (!db.customChapters[subjectId]) {
    db.customChapters[subjectId] = [];
  }

  let chapter = null;
  
  if (isNewChapter) {
    const newChId = chapterId || `custom-ch-${Date.now()}`;
    chapter = {
      id: newChId,
      title: chapterTitle,
      lectures: [],
      notes: [],
      quiz: null
    };
    db.customChapters[subjectId].push(chapter);
  } else {
    chapter = db.customChapters[subjectId].find(c => c.title === chapterTitle || c.id === chapterId);
    if (!chapter) {
      chapter = {
        id: `custom-ch-${Date.now()}`,
        title: chapterTitle,
        lectures: [],
        notes: [],
        quiz: null
      };
      db.customChapters[subjectId].push(chapter);
    }
  }

  if (type === 'lecture') {
    if (!videoId) return res.status(400).json({ error: "यूट्यूब वीडियो ID आवश्यक है।" });
    chapter.lectures.push({
      id: `lec-${Date.now()}`,
      title: title,
      videoId: videoId,
      duration: duration || "45:00",
      date: new Date().toLocaleDateString('hi-IN'),
      description: `अपलोड किया गया लेक्चर: ${title}`
    });
  } else if (type === 'note') {
    let finalContent = content;

    // Handle PDF base64 file upload if present
    if (pdfData) {
      try {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const fileName = `notes-${Date.now()}.pdf`;
        const filePath = path.join(uploadsDir, fileName);
        
        // Decode base64
        const fileBuffer = Buffer.from(pdfData.split(',')[1], 'base64');
        fs.writeFileSync(filePath, fileBuffer);
        
        // Store relative URL path
        finalContent = `/uploads/${fileName}`;
      } catch (err) {
        console.error("PDF write error:", err);
        return res.status(500).json({ error: "PDF फ़ाइल सहेजने में विफल!" });
      }
    }

    if (!finalContent) return res.status(400).json({ error: "नोट्स की सामग्री (Content) या PDF फ़ाइल आवश्यक है।" });

    chapter.notes.push({
      id: `note-${Date.now()}`,
      title: title,
      content: finalContent
    });
  }

  const notifyText = `दिनेश सर ने "${subjectId === 'science' ? 'विज्ञान' : 'गणित'}" के अंतर्गत "${chapterTitle}" में नया ${type === 'lecture' ? 'वीडियो लेक्चर' : 'नोट्स PDF'} अपलोड किया! 📚`;
  db.notifications.unshift({
    id: Date.now(),
    type: "upload",
    text: notifyText,
    date: new Date().toLocaleString('hi-IN')
  });

  writeDB(db);
  sendRichWebhook("📚 नया स्टडी मटेरियल अपलोड", notifyText, "#ff9800", [
    { name: "📚 विषय (Subject)", value: subjectId === 'science' ? 'विज्ञान (Science)' : 'गणित (Maths)', inline: true },
    { name: "📖 अध्याय (Chapter)", value: chapterTitle, inline: true },
    { name: "🏷️ प्रकार (Type)", value: type === 'lecture' ? 'वीडियो लेक्चर (Video)' : 'हस्तलिखित नोट्स PDF', inline: true }
  ]);

  res.status(200).json({ message: "सामग्री सफलतापूर्वक अपलोड कर दी गई है!", customChapters: db.customChapters });
});

// Delete item (Lecture or Note) from customChapters
app.post('/api/admin/delete-item', (req, res) => {
  const { subjectId, chapterId, type, itemId } = req.body;
  if (!subjectId || !chapterId || !type || !itemId) {
    return res.status(400).json({ error: "सभी पैरामीटर आवश्यक हैं।" });
  }

  const db = readDB();
  if (db.customChapters[subjectId]) {
    // Find the chapter that contains the item by looking up the itemId directly (prevents client-side ID mismatch)
    let chapter = null;
    for (let c of db.customChapters[subjectId]) {
      if (type === 'lecture' && c.lectures.some(l => l.id === itemId)) {
        chapter = c;
        break;
      }
      if (type === 'note' && c.notes.some(n => n.id === itemId)) {
        chapter = c;
        break;
      }
    }

    if (chapter) {
      if (type === 'lecture') {
        chapter.lectures = chapter.lectures.filter(l => l.id !== itemId);
      } else if (type === 'note') {
        // Find the note to delete physical PDF file if it exists
        const note = chapter.notes.find(n => n.id === itemId);
        if (note && note.content && note.content.startsWith('/uploads/')) {
          try {
            const filePath = path.join(__dirname, note.content);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log("Deleted physical file:", filePath);
            }
          } catch (err) {
            console.error("Failed to delete physical file:", err);
          }
        }
        chapter.notes = chapter.notes.filter(n => n.id !== itemId);
      }
      writeDB(db);
      return res.status(200).json({ message: "सामग्री सफलतापूर्वक हटा दी गई है!", customChapters: db.customChapters });
    }
  }
  res.status(404).json({ error: "सामग्री नहीं मिली।" });
});

// Delete custom quiz
app.post('/api/admin/delete-quiz', (req, res) => {
  const { quizId } = req.body;
  if (!quizId) {
    return res.status(400).json({ error: "क्विज़ ID आवश्यक है।" });
  }

  const db = readDB();
  if (db.quizzes) {
    db.quizzes = db.quizzes.filter(q => q.id !== quizId);
    writeDB(db);
    return res.status(200).json({ message: "टेस्ट सफलतापूर्वक हटा दिया गया है!" });
  }
  res.status(404).json({ error: "टेस्ट नहीं मिला।" });
});


app.get('/api/admin/notifications', (req, res) => {
  const db = readDB();
  res.status(200).json(db.notifications);
});

app.get('/api/admin/settings', (req, res) => {
  const db = readDB();
  res.status(200).json(db.settings);
});

app.post('/api/admin/settings', (req, res) => {
  const { webhookUrl, smsApiKey, smsSenderId, smsTemplateId } = req.body;
  const db = readDB();
  db.settings.webhookUrl = webhookUrl;
  db.settings.smsApiKey = smsApiKey || "";
  db.settings.smsSenderId = smsSenderId || "";
  db.settings.smsTemplateId = smsTemplateId || "";
  writeDB(db);
  res.status(200).json({ message: "सेटिंग्स अपडेट हो गई हैं!" });
});

app.get('/api/admin/students', (req, res) => {
  const db = readDB();
  const students = db.users.filter(u => u.role === 'student');
  res.status(200).json(students);
});

// Get Public Notifications for Students
app.get('/api/notifications', (req, res) => {
  const db = readDB();
  const publicNotices = db.notifications.filter(
    n => n.type === 'upload' || n.type === 'system' || n.type === 'announcement'
  );
  res.status(200).json(publicNotices);
});

// Post Custom Announcement (Admin Only)
app.post('/api/admin/announcement', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "घोषणा का टेक्स्ट आवश्यक है।" });

  const db = readDB();
  const announcementText = `📢 घोषणा: ${text}`;
  db.notifications.unshift({
    id: Date.now(),
    type: "announcement",
    text: announcementText,
    date: new Date().toLocaleString('hi-IN')
  });
  writeDB(db);
  sendRichWebhook("📢 नई घोषणा (New Announcement)", text, "#03a9f4");

  res.status(200).json({ message: "घोषणा सफलतापूर्वक भेज दी गई!" });
});

// Serve PWA Client Files
app.use(express.static(path.join(__dirname)));

const localIP = getLocalIPAddress();

// Bind to 0.0.0.0 to enable mobile connections on local network
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===========================================================`);
  console.log(`DJ Academy Full-Stack server is active!`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`Mobile Access: http://${localIP}:${PORT}`);
  console.log(`===========================================================`);
});
