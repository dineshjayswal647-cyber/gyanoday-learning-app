// ==========================================================================
// STATE MANAGEMENT & FULL-STACK CONNECTIVITY
// ==========================================================================
let API_URL = window.location.origin;
if (window.location.protocol === 'file:') {
  API_URL = 'https://gyanoday-learning-app.onrender.com';
}

// Automatic PWA Install Prompt Trigger
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Automatically pop up the install dialog on screen
  setTimeout(() => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the PWA install prompt');
        }
        deferredPrompt = null;
      });
    }
  }, 1500); // 1.5 second delay for smooth appearance
});

let state = {
  theme: 'light',
  user: null, 
  enrolledBatches: [],
  completedLectures: [],
  quizResults: [],
  currentQuiz: null,
  liveChatInterval: null,
  totalStudyMinutes: 0,
  todayStudyMinutes: 0,
  lastActiveDate: ''
};

let adminPanelOriginalHTML = '';

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  const adminView = document.getElementById('view-admin');
  if (adminView) {
    adminPanelOriginalHTML = adminView.innerHTML;
    adminView.innerHTML = '';
  }

  loadLocalStorage();
  if (!localStorage.getItem('theme_migrated_v2')) {
    state.theme = 'light';
    localStorage.setItem('theme_migrated_v2', 'true');
    saveState();
  }
  applyTheme();
  setupNavigation();
  setupThemeToggle();
  setupMobileSidebar();
  setupGyanodayAuthHandlers();
  setupChatForm();
  initNotificationSystem(); // Initialize bell notifications
  
  // Check auth state
  checkAuthentication();

  // Initialize and check Study Time Tracker
  const todayStr = new Date().toDateString();
  if (state.lastActiveDate !== todayStr) {
    state.todayStudyMinutes = 0;
    state.lastActiveDate = todayStr;
    saveState();
  }
  updateStudyTimeDisplays();

  // Usage Tracking Loop (Every 60s)
  setInterval(() => {
    if (state.user) {
      state.totalStudyMinutes = (state.totalStudyMinutes || 0) + 1;
      state.todayStudyMinutes = (state.todayStudyMinutes || 0) + 1;
      
      const currentDayStr = new Date().toDateString();
      if (state.lastActiveDate !== currentDayStr) {
        state.todayStudyMinutes = 1;
        state.lastActiveDate = currentDayStr;
      }
      
      saveState();
      updateStudyTimeDisplays();
    }
  }, 60000);

  // Handle routing when URL hash changes
  window.addEventListener('hashchange', handleRouting);
});

// Load state from LocalStorage
function loadLocalStorage() {
  const savedState = localStorage.getItem('dj_academy_state');
  if (savedState) {
    try {
      state = { ...state, ...JSON.parse(savedState) };
    } catch (e) {
      console.error("Error parsing saved state", e);
    }
  }
  if (!state.readNotificationIds) state.readNotificationIds = [];
}

// Save state to LocalStorage
function saveState() {
  localStorage.setItem('dj_academy_state', JSON.stringify(state));
  updateProfileStats();
}

// ==========================================================================
// GYANODAY-STYLE AUTHENTICATION HANDLERS
// ==========================================================================

function checkAuthentication() {
  const savedUser = localStorage.getItem('dj_user');
  const authOverlay = document.getElementById('authOverlay');
  
  if (savedUser) {
    try {
      state.user = JSON.parse(savedUser);
      authOverlay.style.opacity = '0';
      setTimeout(() => {
        authOverlay.style.display = 'none';
      }, 300);

      // Setup layout based on role
      configureLayoutForRole();
      
      // Load custom chapters from backend server
      syncCustomContent()
        .catch(err => console.warn("Failed to sync custom content:", err))
        .finally(() => {
          handleRouting();
        });
    } catch (e) {
      localStorage.removeItem('dj_user');
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
}

function showAuthScreen() {
  const authOverlay = document.getElementById('authOverlay');
  authOverlay.style.display = 'flex';
  authOverlay.style.opacity = '1';
  switchToLoginView();
}

// Password toggle helper (globally defined)
window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fa-solid fa-eye-slash";
  } else {
    input.type = "password";
    icon.className = "fa-solid fa-eye";
  }
};

// View switching triggers
window.switchToLoginView = function() {
  document.getElementById('gyanodayLoginView').style.display = 'block';
  document.getElementById('gyanodayRegisterView').style.display = 'none';
  document.getElementById('gyanodayOTPView').style.display = 'none';
  document.getElementById('authStatus').className = 'auth-status';
  document.getElementById('authStatus').textContent = '';
};

window.switchToRegisterView = function() {
  document.getElementById('gyanodayLoginView').style.display = 'none';
  document.getElementById('gyanodayRegisterView').style.display = 'block';
  document.getElementById('gyanodayOTPView').style.display = 'none';
  document.getElementById('authStatus').className = 'auth-status';
  document.getElementById('authStatus').textContent = '';
};

window.switchToOTPLogin = function() {
  document.getElementById('gyanodayLoginView').style.display = 'none';
  document.getElementById('gyanodayRegisterView').style.display = 'none';
  document.getElementById('gyanodayOTPView').style.display = 'block';
  
  // Reset OTP steps
  document.getElementById('otpPhoneGroup').style.display = 'block';
  document.getElementById('otpCodeGroup').style.display = 'none';
  document.getElementById('btnGYOTPAction').textContent = "Get OTP";
  document.getElementById('gyOTPPhone').value = '';
  document.getElementById('gyOTPCode').value = '';
  
  document.getElementById('authStatus').className = 'auth-status';
  document.getElementById('authStatus').textContent = '';
};

function setupGyanodayAuthHandlers() {
  const loginForm = document.getElementById('gyanodayLoginForm');
  const registerForm = document.getElementById('gyanodayRegisterForm');
  const otpForm = document.getElementById('gyanodayOTPForm');
  const statusDiv = document.getElementById('authStatus');

  // 1. Password-based Login Form Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('gyLoginUser').value.trim();
      const password = document.getElementById('gyLoginPassword').value.trim();

      statusDiv.className = 'auth-status';
      statusDiv.textContent = 'लॉगिन किया जा रहा है...';

      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
          statusDiv.className = 'auth-status success';
          statusDiv.textContent = 'लॉगिन सफल!';
          
          localStorage.setItem('dj_user', JSON.stringify(data.user));
          state.user = data.user;

          setTimeout(() => {
            checkAuthentication();
            if (state.user.role === 'admin') {
              switchTab('admin');
            } else {
              switchTab('dashboard');
            }
          }, 800);
        } else {
          statusDiv.className = 'auth-status error';
          statusDiv.textContent = data.error || 'लॉगिन विफल रहा।';
        }
      } catch (err) {
        // Offline demo fallback login
        console.warn("Server offline, using mock local credentials check.", err);
        if (username === "9838691892" && password === "12345629") {
          const user = { name: "दिनेश जायसवाल (Admin)", phone: "9838691892", role: "admin", email: "dinesh@djacademy.com" };
          localStorage.setItem('dj_user', JSON.stringify(user));
          state.user = user;
          statusDiv.className = 'auth-status success';
          statusDiv.textContent = 'एडमिन लॉगिन सफल (ऑफलाइन)';
          setTimeout(() => {
            checkAuthentication();
            switchTab('admin');
          }, 800);
        } else if (username.length >= 10 && password.length >= 4) {
          const user = { name: "परीक्षण छात्र", phone: username, role: "student" };
          localStorage.setItem('dj_user', JSON.stringify(user));
          state.user = user;
          statusDiv.className = 'auth-status success';
          statusDiv.textContent = 'छात्र लॉगिन सफल (ऑफलाइन)';
          setTimeout(() => {
            checkAuthentication();
            switchTab('dashboard');
          }, 800);
        } else {
          statusDiv.className = 'auth-status error';
          statusDiv.textContent = 'गलत मोबाइल/ईमेल या पासवर्ड!';
        }
      }
    });
  }

  // 2. Registration Form Submit
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('gyRegName').value.trim();
      const phone = document.getElementById('gyRegPhone').value.trim();
      const email = document.getElementById('gyRegEmail').value.trim();
      const password = document.getElementById('gyRegPassword').value.trim();

      statusDiv.className = 'auth-status';
      statusDiv.textContent = 'पंजीकरण किया जा रहा है...';

      try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, email, password })
        });

        const data = await response.json();
        if (response.ok) {
          statusDiv.className = 'auth-status success';
          statusDiv.textContent = 'रजिस्ट्रेशन सफल! लॉगिन हो रहा है...';
          
          localStorage.setItem('dj_user', JSON.stringify(data.user));
          state.user = data.user;
          state.enrolledBatches = ['sankalp-batch'];
          saveState();

          setTimeout(() => {
            checkAuthentication();
            switchTab('dashboard');
          }, 1000);
        } else {
          statusDiv.className = 'auth-status error';
          statusDiv.textContent = data.error || 'रजिस्ट्रेशन विफल रहा।';
        }
      } catch (err) {
        // Offline registration Complete fallback
        console.warn("Server offline. Saving register details locally.", err);
        const user = { name, phone, role: "student", email };
        localStorage.setItem('dj_user', JSON.stringify(user));
        state.user = user;
        state.enrolledBatches = ['sankalp-batch'];
        saveState();

        statusDiv.className = 'auth-status success';
        statusDiv.textContent = 'रजिस्ट्रेशन सफल (ऑफलाइन)!';
        setTimeout(() => {
          checkAuthentication();
          switchTab('dashboard');
        }, 1000);
      }
    });
  }

  // 3. OTP Login Form Submit (Two-step get & verify)
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('gyOTPPhone').value.trim();
      const otpCodeGroup = document.getElementById('otpCodeGroup');

      statusDiv.className = 'auth-status';

      // STEP A: GET OTP
      if (otpCodeGroup.style.display === 'none') {
        statusDiv.textContent = 'OTP कोड भेजा जा रहा है...';
        try {
          const response = await fetch(`${API_URL}/api/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
          });
          const data = await response.json();
          if (response.ok) {
            statusDiv.className = 'auth-status success';
            statusDiv.textContent = 'OTP सफलतापूर्वक भेजा गया!';
            
            // Show OTP field
            document.getElementById('otpPhoneGroup').style.display = 'block'; // Keep showing phone
            otpCodeGroup.style.display = 'block';
            document.getElementById('btnGYOTPAction').textContent = "Verify OTP";
            
            showMockOTPPill(data.otp);
            document.getElementById('gyOTPCode').value = '';
            document.getElementById('gyOTPCode').focus();
          } else {
            statusDiv.className = 'auth-status error';
            statusDiv.textContent = data.error || 'OTP सेंड फेल।';
          }
        } catch (err) {
          // Offline send OTP mock
          statusDiv.className = 'auth-status success';
          statusDiv.textContent = 'OTP कोड भेजा गया (ऑफलाइन)';
          otpCodeGroup.style.display = 'block';
          document.getElementById('btnGYOTPAction').textContent = "Verify OTP";
          showMockOTPPill("1234");
          document.getElementById('gyOTPCode').value = '';
          document.getElementById('gyOTPCode').focus();
        }
      } 
      // STEP B: VERIFY OTP
      else {
        const otp = document.getElementById('gyOTPCode').value.trim();
        if (otp.length !== 4) {
          statusDiv.className = 'auth-status error';
          statusDiv.textContent = 'कृपया 4-अंकीय OTP कोड डालें।';
          return;
        }

        statusDiv.textContent = 'सत्यापित किया जा रहा है...';
        try {
          const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
          });
          const data = await response.json();
          if (response.ok) {
            if (data.isNewUser) {
              // Redirect to register and prefill phone number
              statusDiv.className = 'auth-status success';
              statusDiv.textContent = 'OTP सत्यापित! कृपया विवरण दर्ज करें।';
              setTimeout(() => {
                switchToRegisterView();
                document.getElementById('gyRegPhone').value = phone;
                document.getElementById('gyRegName').focus();
              }, 1000);
            } else {
              // Log in directly
              statusDiv.className = 'auth-status success';
              statusDiv.textContent = 'लॉगिन सफल!';
              localStorage.setItem('dj_user', JSON.stringify(data.user));
              state.user = data.user;
              setTimeout(() => {
                checkAuthentication();
                if (state.user.role === 'admin') {
                  switchTab('admin');
                } else {
                  switchTab('dashboard');
                }
              }, 800);
            }
          } else {
            statusDiv.className = 'auth-status error';
            statusDiv.textContent = data.error || 'सत्यापन विफल।';
          }
        } catch (err) {
          // Offline mock verification
          if (otp === "1234") {
            statusDiv.className = 'auth-status success';
            statusDiv.textContent = 'OTP सत्यापित (ऑफलाइन)';
            setTimeout(() => {
              switchToRegisterView();
              document.getElementById('gyRegPhone').value = phone;
              document.getElementById('gyRegName').focus();
            }, 1000);
          } else {
            statusDiv.className = 'auth-status error';
            statusDiv.textContent = 'गलत OTP! (डेमो कोड: 1234)';
          }
        }
      }
    });
  }
}

// Show a temporary mock notification for OTP codes
function showMockOTPPill(otp) {
  const oldPill = document.getElementById('mockOtpPill');
  if (oldPill) oldPill.remove();

  const pill = document.createElement('div');
  pill.id = 'mockOtpPill';
  pill.style.position = 'fixed';
  pill.style.top = '20px';
  pill.style.left = '50%';
  pill.style.transform = 'translateX(-50%)';
  pill.style.backgroundColor = '#18181b';
  pill.style.border = '2px solid #ff6f00';
  pill.style.padding = '12px 24px';
  pill.style.borderRadius = '30px';
  pill.style.boxShadow = 'var(--shadow-lg)';
  pill.style.zIndex = '100000';
  pill.style.fontFamily = 'var(--font-content)';
  pill.style.textAlign = 'center';
  pill.style.animation = 'slideUp 0.3s forwards';
  pill.style.color = '#ffffff';
  
  pill.innerHTML = `
    <span style="font-size:12px; color:#a1a1aa; display:block;">📲 MOCK SMS: DJ ACADEMY OTP</span>
    <strong style="font-size:20px; color:#ff6f00; font-family:var(--font-display); letter-spacing:1px;">${otp}</strong>
    <span style="font-size:10px; color:#71717a; display:block; margin-top:2px;">(सत्यापन के लिए इसे डालें)</span>
  `;

  document.body.appendChild(pill);
  setTimeout(() => { if (pill) pill.remove(); }, 12000);
}

// Log Out User
function logout() {
  localStorage.removeItem('dj_user');
  state.user = null;
  
  const adminView = document.getElementById('view-admin');
  if (adminView) adminView.innerHTML = '';

  const adminNav = document.getElementById('sidebarAdminLink');
  if (adminNav) adminNav.remove();

  showAuthScreen();
}

// Adjust Sidebar Layout dynamically based on role
function configureLayoutForRole() {
  const sidebarNav = document.querySelector('.sidebar-nav');
  let adminNav = document.getElementById('sidebarAdminLink');
  
  document.querySelector('.sidebar-footer .user-name').textContent = state.user.name.split(' ')[0] + ' ' + (state.user.name.split(' ')[1] || '');
  document.querySelector('.sidebar-footer .user-role').textContent = state.user.role === 'admin' ? 'शिक्षक (Admin)' : 'कक्षा 10 छात्र';
  
  const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.querySelector('.sidebar-footer .user-avatar').textContent = initials;

  if (state.user.role === 'admin') {
    const adminView = document.getElementById('view-admin');
    if (adminView && adminPanelOriginalHTML) {
      adminView.innerHTML = adminPanelOriginalHTML;
    }

    if (!adminNav) {
      adminNav = document.createElement('a');
      adminNav.id = 'sidebarAdminLink';
      adminNav.href = '#admin';
      adminNav.className = 'nav-item';
      adminNav.setAttribute('data-tab', 'admin');
      adminNav.innerHTML = `<i class="fa-solid fa-screwdriver-wrench"></i> <span>एडमिन पैनल (Admin)</span>`;
      adminNav.addEventListener('click', function() { switchTab('admin'); });
      sidebarNav.insertBefore(adminNav, sidebarNav.lastElementChild);
    }
    document.querySelector('.bottom-nav').style.display = 'none';
  } else {
    const adminView = document.getElementById('view-admin');
    if (adminView) {
      adminView.innerHTML = '';
    }
    if (adminNav) adminNav.remove();
    if (window.innerWidth <= 768) {
      document.querySelector('.bottom-nav').style.display = 'flex';
    }
  }
}

// Fetch custom uploaded chapters from server and merge them
async function syncCustomContent() {
  try {
    const response = await fetch(`${API_URL}/api/chapters`);
    if (response.ok) {
      const customChapters = await response.json();
      
      // Merge custom chapters into local mockData
      Object.keys(customChapters).forEach(subId => {
        if (!mockData.subjects[subId]) return;
        
        customChapters[subId].forEach(customCh => {
          const existingCh = mockData.subjects[subId].chapters.find(c => c.id === customCh.id || c.title === customCh.title);
          
          if (existingCh) {
            customCh.lectures.forEach(l => {
              if (!existingCh.lectures.find(el => el.title === l.title)) {
                existingCh.lectures.push(l);
              }
            });
            customCh.notes.forEach(n => {
              if (!existingCh.notes.find(en => en.title === n.title)) {
                existingCh.notes.push(n);
              }
            });
          } else {
            mockData.subjects[subId].chapters.push(customCh);
          }
        });
      });
    }
  } catch (e) {
    console.warn("Backend offline, custom notes sync skipped.", e);
  }
}

// ==========================================================================
// THEME & SIDEBAR TRIGGERS
// ==========================================================================
function applyTheme() {
  document.body.setAttribute('data-theme', state.theme);
  const themeIcon = document.querySelector('#themeToggle i');
  if (themeIcon) {
    themeIcon.className = state.theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

function setupThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      saveState();
    });
  }
}

function setupMobileSidebar() {
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== menuToggle) {
        sidebar.classList.remove('active');
      }
    });
  }
}

// ==========================================================================
// SPA ROUTING
// ==========================================================================
function setupNavigation() {
  const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-item');
  const bottomNavLinks = document.querySelectorAll('.bottom-nav .bottom-nav-item');

  function linkHandler() {
    const tabName = this.getAttribute('data-tab');
    switchTab(tabName);
  }

  sidebarLinks.forEach(link => link.addEventListener('click', linkHandler));
  bottomNavLinks.forEach(link => link.addEventListener('click', linkHandler));
}

function switchTab(tabName) {
  window.location.hash = tabName;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('active');
}

function handleRouting() {
  if (!state.user) return;

  let hash = window.location.hash.substring(1) || 'dashboard';
  
  const allowedTabs = ['dashboard', 'batches', 'live', 'notes', 'quiz', 'profile', 'admin', 'books'];
  if (!allowedTabs.includes(hash)) {
    hash = 'dashboard';
  }

  if (hash === 'admin' && state.user.role !== 'admin') {
    hash = 'dashboard';
    window.location.hash = 'dashboard';
  }

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === hash);
  });
  document.querySelectorAll('.bottom-nav .bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === hash);
  });

  document.querySelectorAll('.tab-content').forEach(view => {
    view.style.display = 'none';
    view.classList.remove('active');
  });

  const activeView = document.getElementById(`view-${hash}`);
  if (activeView) {
    activeView.style.display = 'block';
    activeView.classList.add('active');
  }

  const titles = {
    dashboard: 'होम (Dashboard)',
    batches: 'क्लासरूम और बैचेस',
    live: 'लाइव क्लास रूम 🔴',
    notes: 'हस्तलिखित नोट्स (PDFs)',
    quiz: 'ऑनलाइन टेस्ट सीरीज (Quizzes)',
    profile: 'मेरा प्रोफाइल (Dinesh)',
    admin: 'एडमिन कंट्रोल पैनल',
    books: 'NCERT डिजिटल पुस्तकें 📚'
  };
  document.getElementById('pageTitle').textContent = titles[hash];

  if (hash === 'dashboard') {
    initDashboard();
  } else if (hash === 'batches') {
    initBatches();
  } else if (hash === 'live') {
    initLiveClassroom();
  } else if (hash === 'notes') {
    initNotesExplorer();
  } else if (hash === 'quiz') {
    initQuizExplorer();
  } else if (hash === 'profile') {
    updateProfileStats();
  } else if (hash === 'admin') {
    initAdminPanel();
  } else if (hash === 'books') {
    initBooksExplorer();
  }

  if (hash !== 'live' && state.liveChatInterval) {
    clearInterval(state.liveChatInterval);
    state.liveChatInterval = null;
  }

  window.scrollTo(0, 0);
}

// ==========================================================================
// DASHBOARD VIEWS RENDER
// ==========================================================================
async function initDashboard() {
  const liveCardContainer = document.getElementById('dashboardLiveCard');
  if (!liveCardContainer) return;

  try {
    const response = await fetch(`${API_URL}/api/live/status`);
    if (response.ok) {
      const liveClass = await response.json();
      if (liveClass && liveClass.isActive) {
        liveCardContainer.innerHTML = `
          <div class="live-badge-card" style="background-color: var(--accent-live); color: white; display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 11px; margin-bottom: 12px; animation: pulse 1s infinite;">🔴 लाइव क्लास चालू है</div>
          <div class="live-card-body">
            <h3>${liveClass.title}</h3>
            <p class="teacher-meta" style="margin-top: 6px; font-size: 13px;"><i class="fa-solid fa-user-tie"></i> शिक्षक: दिनेश सर | विषय: ${mockData.subjects[liveClass.subject] ? mockData.subjects[liveClass.subject].title : 'लाइव क्लास'}</p>
            <button class="btn btn-primary" onclick="joinLiveClass()" style="margin-top: 12px;">
              <i class="fa-solid fa-circle-play"></i> क्लास ज्वाइन करें
            </button>
          </div>
        `;
      } else {
        liveCardContainer.innerHTML = `<p style="color: var(--text-secondary);">फिलहाल कोई लाइव क्लास नहीं चल रही है। रिकॉर्डेड वीडियोस देखने के लिए 'बैच' में जाएं।</p>`;
      }
    }
  } catch (err) {
    liveCardContainer.innerHTML = `<p style="color: var(--text-secondary);">फिलहाल कोई लाइव क्लास नहीं चल रही है।</p>`;
  }

  const batchCardContainer = document.getElementById('dashboardBatchCard');
  const isEnrolled = state.enrolledBatches.includes('sankalp-batch');
  
  if (isEnrolled) {
    batchCardContainer.innerHTML = `
      <img src="logo.jpg" alt="Sankalp Logo" class="enrolled-batch-img">
      <div class="eb-info">
        <h4>संकल्प बैच 2027 (UP Board Class 10)</h4>
        <p>प्रगति: गणित (25%), विज्ञान (50%) पूरा | दैनिक टेस्ट जारी</p>
      </div>
      <div class="eb-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    `;
    batchCardContainer.onclick = () => switchTab('batches');
  } else {
    batchCardContainer.innerHTML = `
      <img src="logo.jpg" alt="Sankalp Logo" class="enrolled-batch-img">
      <div class="eb-info">
        <h4>संकल्प बैच 2027 में एनरोल नहीं हैं</h4>
        <p>यूपी बोर्ड परीक्षा के सभी विषयों के क्लासेस के लिए अभी ज्वाइन करें (फ्री)</p>
      </div>
      <div class="eb-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    `;
    batchCardContainer.onclick = () => switchTab('batches');
  }

  // Load the weekly class schedule dynamically
  loadWeeklySchedule();
}

function joinLiveClass() {
  switchTab('live');
}

// ==========================================================================
// BATCHES / CLASSROOM MANAGEMENT
// ==========================================================================
function initBatches() {
  const batchListSection = document.getElementById('batchListSection');
  const batchClassroomSection = document.getElementById('batchClassroomSection');
  const isEnrolled = state.enrolledBatches.includes('sankalp-batch');

  if (isEnrolled) {
    batchListSection.style.display = 'none';
    batchClassroomSection.style.display = 'block';
    renderClassroom();
  } else {
    batchListSection.style.display = 'flex';
    batchClassroomSection.style.display = 'none';
    
    const batch = mockData.batches[0];
    batchListSection.innerHTML = `
      <div class="batch-showcase-card">
        <div class="bsc-header-img">
          <img src="logo.jpg" alt="DJ Logo">
        </div>
        <div class="bsc-body">
          <h2>${batch.title}</h2>
          <p class="bsc-subtitle">${batch.subTitle}</p>
          <p class="bsc-desc">${batch.description}</p>
          
          <div class="bsc-features">
            <div class="feature-pill"><i class="fa-solid fa-circle-check"></i> <span>सभी विषयों के लाइव एवं रिकॉर्डेड लेक्चर्स</span></div>
            <div class="feature-pill"><i class="fa-solid fa-circle-check"></i> <span>दिनेश सर द्वारा तैयार हस्तलिखित PDFs नोट्स</span></div>
            <div class="feature-pill"><i class="fa-solid fa-circle-check"></i> <span>साप्ताहिक मॉक टेस्ट एवं डाउट क्लासेज</span></div>
            <div class="feature-pill"><i class="fa-solid fa-circle-check"></i> <span>विशेष यूपी बोर्ड कक्षा 10 हिन्दी माध्यम पैटर्न</span></div>
          </div>
          
          <div class="bsc-price-row">
            <div class="price-details">
              ${batch.price ? `<span class="price-old">${batch.price}</span>` : ''}
              <span class="price-new" style="color: var(--accent-saffron); font-weight: 800; font-size: 20px;">${batch.discountPrice}</span>
            </div>
            <button class="btn btn-primary" onclick="enrollInBatch('${batch.id}')">मुफ़्त एनरोल करें</button>
          </div>
        </div>
      </div>
    `;
  }
}

function enrollInBatch(batchId) {
  if (!state.enrolledBatches.includes(batchId)) {
    state.enrolledBatches.push(batchId);
    saveState();
    alert("बधाई हो! आप 'संकल्प बैच 2027' में सफलतापूर्वक शामिल हो गए हैं।");
    initBatches();
  }
}

function showBatchList() {
  document.getElementById('batchClassroomSection').style.display = 'none';
  document.getElementById('batchListSection').style.display = 'flex';
}

// Classroom renderer
let activeSubjectId = 'science';
let activeChapterIndex = 0;

function renderClassroom() {
  const tabsContainer = document.getElementById('subjectTabs');
  tabsContainer.innerHTML = '';
  
  Object.keys(mockData.subjects).forEach(subId => {
    const subject = mockData.subjects[subId];
    const button = document.createElement('button');
    button.className = `sub-tab ${activeSubjectId === subId ? 'active' : ''}`;
    button.innerHTML = `<span>${subject.icon}</span> ${subject.title.split(' ')[0]}`;
    button.onclick = () => {
      activeSubjectId = subId;
      activeChapterIndex = 0;
      renderClassroom();
    };
    tabsContainer.appendChild(button);
  });

  const currentSubject = mockData.subjects[activeSubjectId];
  const chapterListNav = document.getElementById('chapterListNav');
  chapterListNav.innerHTML = '';

  if (currentSubject.chapters && currentSubject.chapters.length > 0) {
    currentSubject.chapters.forEach((chapter, index) => {
      const item = document.createElement('div');
      item.className = `ch-nav-item ${activeChapterIndex === index ? 'active' : ''}`;
      const nameOnly = chapter.title.includes(':') ? chapter.title.split(':')[1] : chapter.title;
      item.textContent = chapter.title.split(':')[0] + ': ' + nameOnly.substring(0, 16) + '...';
      item.title = chapter.title;
      item.onclick = () => {
        activeChapterIndex = index;
        renderClassroom();
      };
      chapterListNav.appendChild(item);
    });

    renderChapterContent(currentSubject.chapters[activeChapterIndex]);
  } else {
    chapterListNav.innerHTML = `<p style="padding: 16px; font-size:13px; color: var(--text-secondary);">कोई अध्याय उपलब्ध नहीं है।</p>`;
    document.getElementById('chapterDetailsCard').innerHTML = `<h3>अध्याय उपलब्ध नहीं है</h3>`;
  }
}

function renderChapterContent(chapter) {
  const container = document.getElementById('chapterDetailsCard');
  
  let lecturesHTML = `<span class="classroom-section-label">📽️ वीडियो लेक्चर्स (Lectures)</span>`;
  if (chapter.lectures && chapter.lectures.length > 0) {
    chapter.lectures.forEach(lec => {
      lecturesHTML += `
        <div class="lecture-row-item">
          <div class="lecture-row-left">
            <div class="lecture-play-btn" onclick="playLecture('${lec.videoId}', '${lec.title}', '${activeSubjectId}')">
              <i class="fa-solid fa-play"></i>
            </div>
            <div class="lecture-meta-text">
              <h5>${lec.title}</h5>
              <p><i class="fa-regular fa-clock"></i> ${lec.duration} | अपलोड: ${lec.date}</p>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="playLecture('${lec.videoId}', '${lec.title}', '${activeSubjectId}')">देखें</button>
        </div>
      `;
    });
  } else {
    lecturesHTML += `<p style="font-size:13px; color:var(--text-secondary); margin-bottom: 20px;">इस अध्याय के लेक्चर्स जल्द ही लाइव होंगे।</p>`;
  }

  let materialsHTML = `<div class="material-list">`;
  
  if (chapter.notes && chapter.notes.length > 0) {
    const note = chapter.notes[0];
    materialsHTML += `
      <div class="material-card" onclick="openNotesPDF('${activeSubjectId}', '${chapter.id}', '${note.id}')">
        <div class="mc-left note-type">
          <i class="fa-solid fa-file-pdf"></i>
          <div class="mc-meta">
            <h5>हस्तलिखित नोट्स PDF</h5>
            <p>पढ़ें और डाउनलोड करें</p>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color: var(--text-muted);"></i>
      </div>
    `;
  } else {
    materialsHTML += `
      <div class="material-card" style="opacity: 0.6; cursor: not-allowed;">
        <div class="mc-left note-type">
          <i class="fa-solid fa-file-pdf"></i>
          <div class="mc-meta">
            <h5>नोट्स जल्द उपलब्ध होंगे</h5>
            <p>तैयारी की जा रही है</p>
          </div>
        </div>
      </div>
    `;
  }

  if (chapter.quiz) {
    materialsHTML += `
      <div class="material-card" onclick="startDirectQuiz('${activeSubjectId}', '${chapter.id}')">
        <div class="mc-left quiz-type">
          <i class="fa-solid fa-pen-to-square"></i>
          <div class="mc-meta">
            <h5>साप्ताहिक मॉक टेस्ट</h5>
            <p>${chapter.quiz.questions.length} बहुविकल्पीय प्रश्न</p>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color: var(--text-muted);"></i>
      </div>
    `;
  } else {
    materialsHTML += `
      <div class="material-card" style="opacity: 0.6; cursor: not-allowed;">
        <div class="mc-left quiz-type">
          <i class="fa-solid fa-pen-to-square"></i>
          <div class="mc-meta">
            <h5>क्विज़ जल्द उपलब्ध होगा</h5>
            <p>मॉक टेस्ट</p>
          </div>
        </div>
      </div>
    `;
  }

  materialsHTML += `</div>`;

  container.innerHTML = `
    <h3>${chapter.title}</h3>
    <div class="chapter-materials-wrapper">
      ${lecturesHTML}
      ${materialsHTML}
    </div>
  `;
}

function playLecture(videoId, title, subjectId) {
  const liveTab = mockData.liveClasses[0];
  liveTab.title = title;
  liveTab.videoId = videoId;
  liveTab.teacher = mockData.subjects[subjectId].teacher;
  liveTab.subject = subjectId;
  
  switchTab('live');
}

// ==========================================================================
// LIVE CLASS & SIMULATED CHAT
// ==========================================================================
// ==========================================================================
// LIVE CLASS & SIMULATED CHAT
// ==========================================================================
async function initLiveClassroom() {
  const videoPlayer = document.getElementById('liveVideoPlayer');
  const activeContainer = document.getElementById('activeLiveClassContainer');
  const offlineContainer = document.getElementById('offlineLiveClassContainer');
  
  if (!videoPlayer || !activeContainer || !offlineContainer) return;

  try {
    const response = await fetch(`${API_URL}/api/live/status`);
    if (response.ok) {
      const liveClass = await response.json();
      
      if (liveClass && liveClass.isActive) {
        offlineContainer.style.display = 'none';
        activeContainer.style.display = 'block';
        
        document.getElementById('liveClassTitle').textContent = liveClass.title;
        const subTitle = mockData.subjects[liveClass.subject] ? mockData.subjects[liveClass.subject].title : 'लाइव क्लास';
        document.getElementById('liveClassInstructor').textContent = `दिनेश सर द्वारा संचालित | विषय: ${subTitle}`;
        
        document.getElementById('liveWatchingCount').textContent = liveClass.watchingCount || '10';

        videoPlayer.innerHTML = `
          <iframe src="https://www.youtube.com/embed/${liveClass.videoId}?autoplay=1&mute=0&rel=0&modestbranding=1" 
                  title="DJ Academy Live Class" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  allowfullscreen>
          </iframe>
        `;

        initLiveChat(liveClass.messages, liveClass.enableSimulation);
      } else {
        activeContainer.style.display = 'none';
        offlineContainer.style.display = 'block';
        videoPlayer.innerHTML = '';
        if (state.liveChatInterval) {
          clearInterval(state.liveChatInterval);
          state.liveChatInterval = null;
        }
      }
    }
  } catch (err) {
    activeContainer.style.display = 'none';
    offlineContainer.style.display = 'block';
  }
}

function initLiveChat(initialMsgs, enableSimulation) {
  const chatMessagesBox = document.getElementById('liveChatMessages');
  if (!chatMessagesBox) return;
  chatMessagesBox.innerHTML = ''; 

  if (initialMsgs && initialMsgs.length > 0) {
    initialMsgs.forEach(msg => {
      appendChatMessage(msg.sender, msg.text);
    });
  }

  chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;

  if (state.liveChatInterval) clearInterval(state.liveChatInterval);

  if (enableSimulation) {
    const studentNames = ["आदित्य मौर्य", "कोमल गुप्ता", "विवेक जायसवाल", "नीरज सिंह", "अंजली मौर्या", "सचिन मिश्रा", "पूजा प्रजापति", "अभिषेक विश्वकर्मा"];
    const studentMessages = [
      "सर, उदाहरण 2 दोबारा समझा दीजिये प्लीज।",
      "बहुत अच्छे से समझ आ रहा है सर, थैंक यू!",
      "सर ये प्रश्न बोर्ड एग्जाम में कितने मार्क्स का आता है?",
      "जी सर, बिलकुल सही आंसर आया मेरा भी। 👍",
      "लाइव नोट्स कब मिलेंगे सर?",
      "सर नेक्स्ट क्लास कब होगी?",
      "सर, साइंस का भी लाइव क्लास डेली लीजिये ना।",
      "दिनेश सर बेस्ट पढ़ाते हैं!",
      "क्या बात है, सुपर ट्रिक बताई सर आपने!"
    ];

    state.liveChatInterval = setInterval(() => {
      const randomName = studentNames[Math.floor(Math.random() * studentNames.length)];
      const randomText = studentMessages[Math.floor(Math.random() * studentMessages.length)];
      appendChatMessage(randomName, randomText);
      chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
      
      const countEl = document.getElementById('liveWatchingCount');
      if (countEl) {
        let count = parseInt(countEl.textContent);
        count += Math.floor(Math.random() * 3) - 1;
        if (count < 5) count = 5;
        countEl.textContent = count;
      }
    }, 4500);
  }
}

function appendChatMessage(sender, text) {
  const chatMessagesBox = document.getElementById('liveChatMessages');
  if (!chatMessagesBox) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg';

  const isTeacher = sender.includes('(Teacher)') || sender.includes('दिनेश सर') || sender.includes('Admin') || sender === 'System';
  const senderClass = isTeacher ? 'chat-sender teacher' : 'chat-sender';
  
  msgDiv.innerHTML = `
    <span class="${senderClass}">${sender}:</span>
    <span class="chat-text">${text}</span>
  `;
  
  chatMessagesBox.appendChild(msgDiv);
}

function setupChatForm() {
  const chatForm = document.getElementById('chatForm');
  const chatInputField = document.getElementById('chatInputField');
  
  if (chatForm) {
    chatForm.onsubmit = async (e) => {
      e.preventDefault();
      const text = chatInputField.value.trim();
      if (text) {
        const senderName = state.user ? state.user.name : "छात्र (आप)";
        appendChatMessage(senderName + " (आप)", text);
        chatInputField.value = '';
        
        const chatMessagesBox = document.getElementById('liveChatMessages');
        chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;

        try {
          await fetch(`${API_URL}/api/live/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: senderName, text })
          });
        } catch (err) {
          console.warn("Unable to sync chat:", err);
        }

        setTimeout(() => {
          const teacherReplies = [
            "बिलकुल सही! बहुत बढ़िया कर रहे हो आप।",
            "यह बहुत अच्छा सवाल है। मैं इसे ब्लैकबोर्ड पर समझाता हूँ, ध्यान दो।",
            "यस, बोर्ड परीक्षा में यह हर साल आता है। इसे नोट कर लो।",
            "नोट्स आपको इस क्लास के तुरंत बाद 'फ्री नोट्स' सेक्शन में मिल जाएंगे।"
          ];
          const randomReply = teacherReplies[Math.floor(Math.random() * teacherReplies.length)];
          appendChatMessage("दिनेश सर (Teacher)", randomReply);
          chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
        }, 3000);
      }
    };
  }
}

// ==========================================================================
// NOTES & PDF READER
// ==========================================================================
function initNotesExplorer() {
  document.getElementById('notesListSection').style.display = 'block';
  document.getElementById('pdfReaderSection').style.display = 'none';

  const grid = document.getElementById('notesGrid');
  grid.innerHTML = '';

  Object.keys(mockData.subjects).forEach(subId => {
    const subject = mockData.subjects[subId];
    
    let notesHTML = '';
    subject.chapters.forEach(ch => {
      if (ch.notes && ch.notes.length > 0) {
        ch.notes.forEach(note => {
          notesHTML += `
            <div class="note-item-link" onclick="openNotesPDF('${subId}', '${ch.id}', '${note.id}')">
              <span>📄 ${ch.title.split(':')[0]} नोट्स</span>
              <i class="fa-solid fa-chevron-right"></i>
            </div>
          `;
        });
      }
    });

    if (notesHTML === '') {
      notesHTML = `<p style="font-size:12px; color: var(--text-muted);">कोई नोट्स अभी उपलब्ध नहीं हैं।</p>`;
    }

    grid.innerHTML += `
      <div class="notes-subject-block">
        <h3>${subject.icon} ${subject.title}</h3>
        <div class="notes-links-list">
          ${notesHTML}
        </div>
      </div>
    `;
  });
}

let pdfReaderBackTab = 'notes';

function openNotesPDF(subId, chId, noteId) {
  const subject = mockData.subjects[subId];
  const chapter = subject.chapters.find(c => c.id === chId);
  const note = chapter.notes.find(n => n.id === noteId);

  pdfReaderBackTab = 'notes';
  document.getElementById('notesListSection').style.display = 'none';
  const reader = document.getElementById('pdfReaderSection');
  reader.style.display = 'flex';
  document.getElementById('pdfTitle').textContent = `${subject.title} - ${chapter.title.split(':')[0]} (${note.title})`;

  if (note.content.startsWith('/uploads/')) {
    const fullPdfUrl = `${API_URL}${note.content}`;
    renderPDFOffline(fullPdfUrl);
  } else {
    document.getElementById('pdfContentBody').innerHTML = note.content;
  }
}

function closePDFReader() {
  document.getElementById('pdfReaderSection').style.display = 'none';
  if (pdfReaderBackTab === 'books') {
    const viewBooks = document.getElementById('view-books');
    if (viewBooks) viewBooks.style.display = 'block';
  } else {
    document.getElementById('notesListSection').style.display = 'block';
  }
}

// ==========================================================================
// QUIZ ENGINE
// ==========================================================================
async function initQuizExplorer() {
  showQuizSelect();
  const grid = document.getElementById('quizGrid');
  grid.innerHTML = '<p style="text-align:center; padding:16px; font-size:12.5px; color:var(--text-secondary);">टेस्ट लोड हो रहे हैं...</p>';

  let customQuizzes = [];
  try {
    const response = await fetch(`${API_URL}/api/quizzes`);
    if (response.ok) {
      customQuizzes = await response.json();
    }
  } catch (err) {
    console.warn("Offline, custom quizzes load skipped.", err);
  }

  grid.innerHTML = '';

  Object.keys(mockData.subjects).forEach(subId => {
    const subject = mockData.subjects[subId];
    
    let quizHTML = '';
    
    // 1. Render default static quizzes
    subject.chapters.forEach(ch => {
      if (ch.quiz) {
        quizHTML += `
          <div class="quiz-link-item" onclick="startDirectQuiz('${subId}', '${ch.id}')">
            <span>📝 ${ch.title.split(':')[0]} टेस्ट</span>
            <i class="fa-solid fa-circle-play"></i>
          </div>
        `;
      }
    });

    // 2. Render dynamic custom quizzes
    const subjectCustomQuizzes = customQuizzes.filter(q => q.subjectId === subId);
    subjectCustomQuizzes.forEach(q => {
      quizHTML += `
        <div class="quiz-link-item" onclick="startCustomQuiz('${q.id}')" style="border-left: 2px solid var(--accent-saffron);">
          <span>📝 ${q.title}</span>
          <i class="fa-solid fa-circle-play" style="color: var(--accent-saffron);"></i>
        </div>
      `;
    });

    if (quizHTML === '') {
      quizHTML = `<p style="font-size:12px; color: var(--text-muted);">कोई टेस्ट उपलब्ध नहीं है।</p>`;
    }

    grid.innerHTML += `
      <div class="quiz-subject-card">
        <h3>${subject.icon} ${subject.title}</h3>
        <div class="quiz-links-list">
          ${quizHTML}
        </div>
      </div>
    `;
  });
}

function showQuizSelect() {
  document.getElementById('quizSelectSection').style.display = 'block';
  document.getElementById('quizPlaySection').style.display = 'none';
  document.getElementById('quizResultSection').style.display = 'none';
}

let activeQuizData = null;
let currentQuestionIndex = 0;
let selectedOptionIndex = null;
let quizTimerInterval = null;
let quizTimeLeft = 180; 
let quizTimeSpent = 0;
let userAnswers = []; 

function startDirectQuiz(subjectId, chapterId) {
  const subject = mockData.subjects[subjectId];
  const chapter = subject.chapters.find(c => c.id === chapterId);
  const quiz = chapter.quiz;

  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    alert("इस पाठ का टेस्ट अभी तैयार किया जा रहा है।");
    return;
  }

  // Enrollment check
  if (!state.enrolledBatches.includes('sankalp-batch')) {
    alert("टेस्ट देने के लिए पहले संकल्प बैच में एनरोल करें (यह फ्री है)!");
    switchTab('batches');
    return;
  }

  switchTab('quiz');

  activeQuizData = quiz;
  currentQuestionIndex = 0;
  selectedOptionIndex = null;
  userAnswers = [];
  quizTimeLeft = quiz.questions.length * 60; 
  quizTimeSpent = 0;

  document.getElementById('quizSelectSection').style.display = 'none';
  document.getElementById('quizResultSection').style.display = 'none';
  document.getElementById('quizPlaySection').style.display = 'block';

  loadQuestion();
  startQuizTimer();
}

function startQuizTimer() {
  if (quizTimerInterval) clearInterval(quizTimerInterval);
  updateTimerUI();
  quizTimerInterval = setInterval(() => {
    quizTimeLeft--;
    quizTimeSpent++;
    updateTimerUI();
    if (quizTimeLeft <= 0) {
      clearInterval(quizTimerInterval);
      alert("समय समाप्त! आपका टेस्ट सबमिट किया जा रहा है।");
      submitQuiz();
    }
  }, 1000);
}

function updateTimerUI() {
  const minutes = Math.floor(quizTimeLeft / 60);
  const seconds = quizTimeLeft % 60;
  document.getElementById('timerText').textContent = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function loadQuestion() {
  const question = activeQuizData.questions[currentQuestionIndex];
  
  document.getElementById('activeQuizTitle').textContent = activeQuizData.title;
  document.getElementById('questionNumText').textContent = `प्रश्न ${currentQuestionIndex + 1} of ${activeQuizData.questions.length}`;
  document.getElementById('questionText').textContent = question.question;

  const progressPercent = ((currentQuestionIndex) / activeQuizData.questions.length) * 100;
  document.getElementById('quizProgressFill').style.width = `${progressPercent}%`;

  const optionsList = document.getElementById('quizOptionsList');
  optionsList.innerHTML = '';
  selectedOptionIndex = null;

  question.options.forEach((opt, idx) => {
    const letters = ['A', 'B', 'C', 'D'];
    const button = document.createElement('button');
    button.className = 'quiz-option-btn';
    button.innerHTML = `
      <span class="option-letter">${letters[idx]}</span>
      <span class="option-content">${opt}</span>
    `;
    button.onclick = () => {
      document.querySelectorAll('.quiz-option-btn').forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      selectedOptionIndex = idx;
    };
    optionsList.appendChild(button);
  });

  const nextBtn = document.getElementById('quizNextBtn');
  if (currentQuestionIndex === activeQuizData.questions.length - 1) {
    nextBtn.innerHTML = `टेस्ट सबमिट करें <i class="fa-solid fa-circle-check"></i>`;
  } else {
    nextBtn.innerHTML = `अगला प्रश्न <i class="fa-solid fa-arrow-right"></i>`;
  }
}

function nextQuestion() {
  if (selectedOptionIndex === null) {
    alert("कृपया कोई एक विकल्प चुनें!");
    return;
  }

  userAnswers.push(selectedOptionIndex);

  if (currentQuestionIndex < activeQuizData.questions.length - 1) {
    currentQuestionIndex++;
    loadQuestion();
  } else {
    submitQuiz();
  }
}

function quitQuiz() {
  if (confirm("क्या आप वाकई टेस्ट छोड़ना चाहते हैं? आपकी प्रोग्रेस सेव नहीं होगी।")) {
    clearInterval(quizTimerInterval);
    showQuizSelect();
  }
}

function submitQuiz() {
  clearInterval(quizTimerInterval);

  let correctCount = 0;
  activeQuizData.questions.forEach((q, idx) => {
    if (userAnswers[idx] === q.correctIndex) {
      correctCount++;
    }
  });

  const totalQuestions = activeQuizData.questions.length;
  const percentage = Math.round((correctCount / totalQuestions) * 100);

  document.getElementById('quizPlaySection').style.display = 'none';
  document.getElementById('quizResultSection').style.display = 'block';

  document.getElementById('resultSubjectInfo').textContent = activeQuizData.title;
  document.getElementById('resultScore').textContent = `${correctCount}/${totalQuestions}`;
  document.getElementById('resultPercentage').textContent = `${percentage}%`;
  document.getElementById('resultCorrectCount').textContent = correctCount;
  
  const minSpent = Math.floor(quizTimeSpent / 60);
  const secSpent = quizTimeSpent % 60;
  document.getElementById('resultTimeSpent').textContent = 
    minSpent > 0 ? `${minSpent}m ${secSpent}s` : `${secSpent}s`;

  document.getElementById('answersAnalysis').style.display = 'none';

  state.quizResults.push({
    quizId: activeQuizData.id,
    score: correctCount,
    total: totalQuestions,
    percentage: percentage,
    date: new Date().toLocaleDateString()
  });
  saveState();
}

function showQuizAnalysis() {
  const analysisDiv = document.getElementById('answersAnalysis');
  analysisDiv.style.display = 'block';

  const analysisList = document.getElementById('analysisList');
  analysisList.innerHTML = '';

  activeQuizData.questions.forEach((q, qIdx) => {
    const letters = ['A', 'B', 'C', 'D'];
    const studentAnsIdx = userAnswers[qIdx];
    const correctAnsIdx = q.correctIndex;
    
    let optionsListHTML = '';
    q.options.forEach((opt, optIdx) => {
      let extraClass = '';
      if (optIdx === correctAnsIdx) {
        extraClass = 'correct';
      } else if (optIdx === studentAnsIdx && studentAnsIdx !== correctAnsIdx) {
        extraClass = 'incorrect';
      }
      optionsListHTML += `
        <div class="ans-rev-opt ${extraClass}">
          <strong>${letters[optIdx]}.</strong> ${opt} 
          ${optIdx === correctAnsIdx ? ' (सही उत्तर)' : ''}
          ${optIdx === studentAnsIdx && studentAnsIdx !== correctAnsIdx ? ' (आपका गलत उत्तर)' : ''}
        </div>
      `;
    });

    analysisList.innerHTML += `
      <div class="analysis-item">
        <h4><strong>प्रश्न ${qIdx + 1}:</strong> ${q.question}</h4>
        <div class="analysis-options-review">
          ${optionsListHTML}
        </div>
        <div class="analysis-explanation">
          <strong>स्पष्टीकरण:</strong> ${q.explanation}
        </div>
      </div>
    `;
  });

  analysisDiv.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================================================
// PROFILE STATS TRACKER
// ==========================================================================
function updateProfileStats() {
  const enrolledCount = state.enrolledBatches.length;
  const profileEnrolledBatches = document.getElementById('profileEnrolledBatches');
  if (profileEnrolledBatches) profileEnrolledBatches.textContent = enrolledCount;

  const totalQuizzesGiven = state.quizResults.length;
  const profileTestsGiven = document.getElementById('profileTestsGiven');
  if (profileTestsGiven) profileTestsGiven.textContent = totalQuizzesGiven;

  let totalPercentage = 0;
  state.quizResults.forEach(r => {
    totalPercentage += r.percentage;
  });

  const avgPercentage = totalQuizzesGiven > 0 ? Math.round(totalPercentage / totalQuizzesGiven) : 0;
  const profileAvgScore = document.getElementById('profileAvgScore');
  if (profileAvgScore) profileAvgScore.textContent = `${avgPercentage}%`;
}

function resetAppData() {
  if (confirm("क्या आप सचमुच अपना सभी डेटा रीसेट करना चाहते हैं? इसमें एनरोलमेंट और टेस्ट स्कोर शामिल हैं।")) {
    state.enrolledBatches = [];
    state.completedLectures = [];
    state.quizResults = [];
    saveState();
    logout();
  }
}

// ==========================================================================
// ADMIN CONTROL PANEL INTERACTIVES
// ==========================================================================
function initAdminPanel() {
  populateAdminChapterDropdown();
  loadAdminNotifications();
  loadAdminStudents();
  loadAdminSettings();
  loadAdminContentManager();

  const uploadForm = document.getElementById('adminUploadForm');
  if (uploadForm) {
    uploadForm.onsubmit = async (e) => {
      e.preventDefault();
      const subjectId = document.getElementById('adminSubjectSelect').value;
      const select = document.getElementById('adminChapterSelect');
      if (!select.value) return alert("कृपया एक अध्याय चुनें!");

      const isNew = select.value === 'NEW_CHAPTER';
      const contentType = document.getElementById('adminContentType').value;
      const title = document.getElementById('adminContentTitle').value.trim();

      let chapterTitle = '';
      let chapterId = '';

      if (isNew) {
        chapterTitle = document.getElementById('newChapterTitle').value.trim();
        chapterId = `custom-ch-${Date.now()}`;
        if (!chapterTitle) return alert("नए अध्याय का शीर्षक डालें!");
      } else {
        chapterTitle = select.options[select.selectedIndex].text;
        chapterId = select.value;
      }

      const bodyData = {
        subjectId,
        chapterTitle,
        isNewChapter: isNew,
        chapterId,
        type: contentType,
        title
      };

      if (contentType === 'lecture') {
        bodyData.videoId = document.getElementById('adminVideoId').value.trim();
        bodyData.duration = document.getElementById('adminVideoDuration').value.trim();
        if (!bodyData.videoId) return alert("यूट्यूब वीडियो ID डालें!");
      } else {
        // PDF File upload check
        const fileInput = document.getElementById('adminPdfFile');
        if (fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          try {
            const base64Data = await readPdfFileAsBase64(file);
            bodyData.pdfData = base64Data;
          } catch (err) {
            return alert("PDF फ़ाइल पढ़ने में विफल!");
          }
        }
        bodyData.content = document.getElementById('adminNotesContent').value.trim();
        if (!bodyData.pdfData && !bodyData.content) {
          return alert("कृपया नोट्स का टेक्स्ट लिखें या फिर कोई PDF फ़ाइल चुनें!");
        }
      }

      try {
        const response = await fetch(`${API_URL}/api/admin/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });

        if (response.ok) {
          alert("स्टडी मटेरियल सफलतापूर्वक अपलोड हो गया!");
          uploadForm.reset();
          handleAdminChapterChange();
          toggleAdminContentFields();
          
          await syncCustomContent();
          initAdminPanel();
        } else {
          const data = await response.json();
          alert("अपलोड विफल: " + data.error);
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है। यह फीचर केवल फुल-स्टैक मोड में उपलब्ध है।");
      }
    };
  }

  const settingsForm = document.getElementById('adminSettingsForm');
  if (settingsForm) {
    settingsForm.onsubmit = async (e) => {
      e.preventDefault();
      const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
      
      try {
        const response = await fetch(`${API_URL}/api/admin/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl })
        });
        if (response.ok) {
          alert("वेबहुक सेटिंग्स सेव हो गई हैं!");
        } else {
          alert("अपडेट विफल!");
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है!");
      }
    };
  }

  const announcementForm = document.getElementById('adminAnnouncementForm');
  if (announcementForm) {
    announcementForm.onsubmit = async (e) => {
      e.preventDefault();
      const text = document.getElementById('adminAnnouncementText').value.trim();

      try {
        const response = await fetch(`${API_URL}/api/admin/announcement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (response.ok) {
          alert("घोषणा सफलतापूर्वक सभी छात्रों को भेज दी गई है! 📢");
          announcementForm.reset();
          loadAdminNotifications();
        } else {
          alert("घोषणा भेजने में विफलता!");
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है!");
      }
    };
  }

  const startLiveForm = document.getElementById('adminStartLiveForm');
  if (startLiveForm) {
    startLiveForm.onsubmit = async (e) => {
      e.preventDefault();
      const subjectId = document.getElementById('liveSubjectSelect').value;
      const title = document.getElementById('liveClassTitleInput').value.trim();
      const videoId = document.getElementById('liveVideoIdInput').value.trim();
      const enableSimulation = document.getElementById('liveEnableSimulation').checked;

      try {
        const response = await fetch(`${API_URL}/api/admin/live/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, title, videoId, enableSimulation })
        });
        if (response.ok) {
          alert("🔴 लाइव क्लास सफलतापूर्वक शुरू हो गई है!");
          startLiveForm.reset();
          checkLiveClassStatusInAdmin();
          checkLiveStatusGlobally();
        } else {
          alert("लाइव क्लास शुरू करने में विफलता!");
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है!");
      }
    };
  }

  checkLiveClassStatusInAdmin();

  const scheduleForm = document.getElementById('adminScheduleForm');
  if (scheduleForm) {
    scheduleForm.onsubmit = async (e) => {
      e.preventDefault();
      const dayId = document.getElementById('scheduleDaySelect').value;
      const status = document.getElementById('scheduleStatusSelect').value;
      const time = document.getElementById('scheduleTimeInput').value.trim();
      const subject = document.getElementById('scheduleSubjectInput').value.trim();
      const topic = document.getElementById('scheduleTopicInput').value.trim();

      try {
        const response = await fetch(`${API_URL}/api/admin/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayId, status, time, subject, topic })
        });
        if (response.ok) {
          alert("📅 साप्ताहिक क्लास शेड्यूल सफलतापूर्वक अपडेट कर दिया गया है!");
          scheduleForm.reset();
          toggleScheduleStatusFields();
        } else {
          alert("शेड्यूल अपडेट करने में विफलता!");
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है!");
      }
    };
  }

  const quizForm = document.getElementById('adminQuizForm');
  if (quizForm) {
    quizForm.onsubmit = async (e) => {
      e.preventDefault();
      const subjectId = document.getElementById('quizSubjectSelect').value;
      const title = document.getElementById('quizTitleInput').value.trim();

      const q1 = {
        question: document.getElementById('q1Text').value.trim(),
        options: [
          document.getElementById('q1OptA').value.trim(),
          document.getElementById('q1OptB').value.trim(),
          document.getElementById('q1OptC').value.trim(),
          document.getElementById('q1OptD').value.trim()
        ],
        correctIndex: parseInt(document.getElementById('q1Correct').value),
        explanation: document.getElementById('q1Explanation').value.trim()
      };

      const q2 = {
        question: document.getElementById('q2Text').value.trim(),
        options: [
          document.getElementById('q2OptA').value.trim(),
          document.getElementById('q2OptB').value.trim(),
          document.getElementById('q2OptC').value.trim(),
          document.getElementById('q2OptD').value.trim()
        ],
        correctIndex: parseInt(document.getElementById('q2Correct').value),
        explanation: document.getElementById('q2Explanation').value.trim()
      };

      try {
        const response = await fetch(`${API_URL}/api/admin/quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, title, questions: [q1, q2] })
        });
        if (response.ok) {
          alert("📝 नया मॉक टेस्ट सफलतापूर्वक लाइव हो गया है!");
          quizForm.reset();
        } else {
          alert("मॉक टेस्ट लाइव करने में विफलता!");
        }
      } catch (err) {
        alert("सर्वर ऑफलाइन है!");
      }
    };
  }

  // Set initial status fields visibility
  toggleScheduleStatusFields();
}

window.handleAdminChapterChange = function() {
  const select = document.getElementById('adminChapterSelect');
  const newChGroup = document.getElementById('newChapterGroup');
  if (select && newChGroup) {
    if (select.value === 'NEW_CHAPTER') {
      newChGroup.style.display = 'block';
      const input = document.getElementById('newChapterTitle');
      if (input) input.focus();
    } else {
      newChGroup.style.display = 'none';
    }
  }
};

function populateAdminChapterDropdown() {
  const subjectId = document.getElementById('adminSubjectSelect').value;
  const select = document.getElementById('adminChapterSelect');
  if (!select) return;
  select.innerHTML = '';

  // Add default select option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- अध्याय चुनें --';
  defaultOpt.disabled = true;
  defaultOpt.selected = true;
  select.appendChild(defaultOpt);

  const subject = mockData.subjects[subjectId];
  if (subject && subject.chapters) {
    subject.chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.title;
      select.appendChild(opt);
    });
  }

  // Add option to create a new chapter
  const newChOpt = document.createElement('option');
  newChOpt.value = 'NEW_CHAPTER';
  newChOpt.textContent = '+ नया अध्याय जोड़ें (Create New Chapter)';
  select.appendChild(newChOpt);

  // Bind change handler
  handleAdminChapterChange();

  document.getElementById('adminSubjectSelect').onchange = () => {
    populateAdminChapterDropdown();
  };
}

function readPdfFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
}

function toggleAdminContentFields() {
  const type = document.getElementById('adminContentType').value;
  document.getElementById('adminVideoFields').style.display = type === 'lecture' ? 'block' : 'none';
  document.getElementById('adminNotesFields').style.display = type === 'note' ? 'block' : 'none';
}

async function loadAdminNotifications() {
  const container = document.getElementById('adminLogsList');
  if (!container) return;
  container.innerHTML = '';

  try {
    const response = await fetch(`${API_URL}/api/admin/notifications`);
    if (response.ok) {
      const logs = await response.json();
      logs.forEach(log => {
        const div = document.createElement('div');
        div.className = `admin-log-item ${log.type}`;
        div.innerHTML = `
          <span>${log.text}</span>
          <span class="log-date">${log.date}</span>
        `;
        container.appendChild(div);
      });
    }
  } catch (e) {
    container.innerHTML = `<p style="font-size:12px; color: var(--text-muted);">सर्वर ऑफलाइन है, लाइव लॉग लोड नहीं हो सके।</p>`;
  }
}

async function loadAdminStudents() {
  const container = document.getElementById('adminStudentsList');
  if (!container) return;
  container.innerHTML = '';

  try {
    const response = await fetch(`${API_URL}/api/admin/students`);
    if (response.ok) {
      const students = await response.json();
      if (students.length === 0) {
        container.innerHTML = `<p style="font-size:12px; color: var(--text-muted);">कोई छात्र अभी तक रजिस्टर नहीं हुआ है।</p>`;
        return;
      }
      students.forEach(stud => {
        const div = document.createElement('div');
        div.className = 'admin-student-row';
        div.innerHTML = `
          <div class="stud-name-meta">
            <h5>${stud.name}</h5>
            <p>फोन: ${stud.phone}</p>
          </div>
          <span class="stud-date">${stud.enrolledDate || 'आज'}</span>
        `;
        container.appendChild(div);
      });
    }
  } catch (e) {
    container.innerHTML = `<p style="font-size:12px; color: var(--text-muted);">छात्र सूची लोड करने में विफल (सर्वर ऑफलाइन)।</p>`;
  }
}

async function loadAdminSettings() {
  try {
    const response = await fetch(`${API_URL}/api/admin/settings`);
    if (response.ok) {
      const settings = await response.json();
      const discordInput = document.getElementById('discordWebhookUrl');
      if (discordInput) discordInput.value = settings.webhookUrl || '';
    }
  } catch (e) {
    console.warn("Unable to fetch settings.", e);
  }
}

// ==========================================================================
// NOTIFICATION DROPDOWN SYSTEM
// ==========================================================================

window.clearLocalNotifications = function() {
  if (!state.clearedNotificationIds) state.clearedNotificationIds = [];
  if (state.notifications && state.notifications.length > 0) {
    state.notifications.forEach(n => {
      if (!state.clearedNotificationIds.includes(n.id)) {
        state.clearedNotificationIds.push(n.id);
      }
    });
    saveState();
    renderNotificationsList();
  }
};

window.markAllNotificationsAsRead = function() {
  if (state.notifications && state.notifications.length > 0) {
    state.notifications.forEach(n => {
      if (!state.readNotificationIds.includes(n.id)) {
        state.readNotificationIds.push(n.id);
      }
    });
    saveState();
    renderNotificationsList();
  }
};

window.initNotificationSystem = function() {
  const btn = document.getElementById('notificationBtn');
  const dropdown = document.getElementById('notificationDropdown');

  if (btn && dropdown) {
    // Toggle dropdown
    btn.onclick = (e) => {
      e.stopPropagation();
      const isHidden = dropdown.style.display === 'none';
      dropdown.style.display = isHidden ? 'flex' : 'none';
      
      // When opened, mark all currently visible ones as read (clears badge, but keeps list)
      if (isHidden) {
        markAllNotificationsAsRead();
      }
    };

    // Close dropdown on click outside
    window.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });

    dropdown.onclick = (e) => {
      e.stopPropagation(); // Prevent closing when clicking inside dropdown
    };
  }

  // Load notifications from server
  fetchNotifications();
};

async function fetchNotifications() {
  try {
    const response = await fetch(`${API_URL}/api/notifications`);
    if (response.ok) {
      const data = await response.json();
      state.notifications = data;
      renderNotificationsList();
    }
  } catch (err) {
    console.warn("Unable to fetch notifications. Offline mode active.", err);
    // Offline placeholder notifications
    state.notifications = [
      { id: 101, type: 'system', text: 'DJ Academy ऑफलाइन डेमो मोड में चालू है।', date: 'आज' },
      { id: 102, type: 'upload', text: 'दिनेश सर ने विज्ञान में नया नोट्स PDF अपलोड किया!', date: 'कल' }
    ];
    renderNotificationsList();
  }
}

function renderNotificationsList() {
  const container = document.getElementById('notificationList');
  const badge = document.getElementById('notificationBadge');
  if (!container) return;

  container.innerHTML = '';
  
  if (!state.readNotificationIds) state.readNotificationIds = [];
  if (!state.clearedNotificationIds) state.clearedNotificationIds = [];
  
  let unreadCount = 0;

  // Filter out notifications that the user has cleared
  const visibleNotifications = state.notifications ? state.notifications.filter(n => !state.clearedNotificationIds.includes(n.id)) : [];

  if (visibleNotifications.length > 0) {
    visibleNotifications.forEach(n => {
      const isUnread = !state.readNotificationIds.includes(n.id);
      if (isUnread) unreadCount++;

      const div = document.createElement('div');
      div.className = `nd-item ${isUnread ? 'unread' : ''}`;
      
      // Icon selection based on type
      let icon = '🔔';
      if (n.type === 'upload') icon = '📚';
      if (n.type === 'announcement') icon = '📢';

      div.innerHTML = `
        <div class="nd-text">${icon} ${n.text}</div>
        <div class="nd-date">${n.date}</div>
      `;

      // Mark single item read on click
      div.onclick = () => {
        if (isUnread) {
          state.readNotificationIds.push(n.id);
          saveState();
          renderNotificationsList();
        }
      };

      container.appendChild(div);
    });
  } else {
    container.innerHTML = `<p style="padding: 16px; text-align: center; font-size: 12px; color: var(--text-muted);">कोई सूचना नहीं है।</p>`;
  }

  // Update badge display
  if (badge) {
    if (unreadCount > 0) {
      badge.style.display = 'flex';
      badge.textContent = unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }
}

async function checkLiveClassStatusInAdmin() {
  const startLiveForm = document.getElementById('adminStartLiveForm');
  const activeStatus = document.getElementById('adminLiveActiveStatus');
  const activeTitle = document.getElementById('adminLiveActiveTitle');
  if (!startLiveForm || !activeStatus || !activeTitle) return;

  try {
    const response = await fetch(`${API_URL}/api/live/status`);
    if (response.ok) {
      const liveClass = await response.json();
      if (liveClass && liveClass.isActive) {
        startLiveForm.style.display = 'none';
        activeStatus.style.display = 'block';
        const subTitle = mockData.subjects[liveClass.subject] ? mockData.subjects[liveClass.subject].title : 'लाइव क्लास';
        activeTitle.textContent = `${liveClass.title} (विषय: ${subTitle})`;
      } else {
        startLiveForm.style.display = 'block';
        activeStatus.style.display = 'none';
        activeTitle.textContent = '';
      }
    }
  } catch (err) {
    // offline ignore
  }
}

window.stopLiveClass = async function() {
  try {
    const response = await fetch(`${API_URL}/api/admin/live/stop`, {
      method: 'POST'
    });
    if (response.ok) {
      alert("🔴 लाइव क्लास सफलतापूर्वक बंद कर दी गई है।");
      checkLiveClassStatusInAdmin();
      checkLiveStatusGlobally();
    } else {
      alert("बंद करने में विफलता!");
    }
  } catch (err) {
    alert("सर्वर ऑफलाइन है!");
  }
};

window.joinLiveClass = function() {
  switchTab('live');
};

async function checkLiveStatusGlobally() {
  try {
    const response = await fetch(`${API_URL}/api/live/status`);
    if (response.ok) {
      const liveClass = await response.json();
      
      const badge = document.querySelector('.badge-live');
      const bottomBadge = document.querySelector('.bottom-badge-live');
      
      if (liveClass && liveClass.isActive) {
        if (badge) badge.style.display = 'inline-block';
        if (bottomBadge) bottomBadge.style.display = 'block';
      } else {
        if (badge) badge.style.display = 'none';
        if (bottomBadge) bottomBadge.style.display = 'none';
      }
    }
  } catch (e) {
    // offline ignore
  }
}

// Check live status on start and every 10 seconds
checkLiveStatusGlobally();
setInterval(checkLiveStatusGlobally, 10000);

window.toggleScheduleStatusFields = function() {
  const status = document.getElementById('scheduleStatusSelect').value;
  const activeFields = document.getElementById('scheduleActiveFields');
  if (activeFields) {
    activeFields.style.display = status === 'Active' ? 'block' : 'none';
  }
};

async function loadWeeklySchedule() {
  const container = document.getElementById('dashboardScheduleGrid');
  if (!container) return;

  try {
    const response = await fetch(`${API_URL}/api/schedule`);
    if (response.ok) {
      const schedule = await response.json();
      container.innerHTML = '';
      
      schedule.forEach(item => {
        const isActive = item.status === 'Active';
        const badgeClass = isActive ? 'schedule-status-badge active' : 'schedule-status-badge cancelled';
        const dotClass = isActive ? 'pulse-dot-green' : 'pulse-dot-red';
        const statusText = isActive ? 'क्लास चालू है' : 'आज छुट्टी है';
        
        const card = document.createElement('div');
        card.className = 'schedule-item-card';
        card.innerHTML = `
          <div class="schedule-item-left">
            <span class="schedule-day-lbl">${item.dayName}</span>
            <div class="schedule-details">
              <span class="schedule-subject">${isActive ? item.subject : 'साप्ताहिक अवकाश'}</span>
              <span class="schedule-topic">${isActive ? item.topic : 'कोई क्लास नहीं होगी (Holiday)'}</span>
            </div>
          </div>
          <div class="schedule-item-right">
            ${isActive ? `<span class="schedule-time-lbl">${item.time}</span>` : ''}
            <span class="${badgeClass}">
              <span class="${dotClass}"></span> ${statusText}
            </span>
          </div>
        `;
        container.appendChild(card);
      });
    }
  } catch (err) {
    container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 16px; font-size: 13px;">ऑफ़लाइन मोड: समय सारणी लोड करने में असमर्थ।</p>`;
  }
}

function formatStudyTime(minutes) {
  if (!minutes || minutes <= 0) return '0 मिनट';
  if (minutes < 60) return `${minutes} मिनट`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs} घंटा ${mins} मिनट`;
}

function updateStudyTimeDisplays() {
  const todayVal = state.todayStudyMinutes || 0;
  const totalVal = state.totalStudyMinutes || 0;
  
  const formattedToday = formatStudyTime(todayVal);
  const formattedTotal = formatStudyTime(totalVal);
  
  const dashTime = document.getElementById('dashboardStudyTime');
  if (dashTime) {
    dashTime.textContent = `आज: ${formattedToday} | कुल: ${formattedTotal}`;
  }
  
  const profToday = document.getElementById('profileTodayTime');
  if (profToday) {
    profToday.textContent = formattedToday;
  }
  
  const profTotal = document.getElementById('profileTotalTime');
  if (profTotal) {
    profTotal.textContent = formattedTotal;
  }
}

window.startCustomQuiz = async function(quizId) {
  // Enrollment check
  if (!state.enrolledBatches.includes('sankalp-batch')) {
    alert("टेस्ट देने के लिए पहले संकल्प बैच में एनरोल करें (यह फ्री है)!");
    switchTab('batches');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/quizzes`);
    if (response.ok) {
      const customQuizzes = await response.json();
      const quiz = customQuizzes.find(q => q.id === quizId);
      if (quiz) {
        activeQuizData = quiz;
        currentQuestionIndex = 0;
        selectedOptionIndex = null;
        userAnswers = [];
        quizTimeLeft = quiz.questions.length * 60; 
        quizTimeSpent = 0;

        document.getElementById('quizSelectSection').style.display = 'none';
        document.getElementById('quizResultSection').style.display = 'none';
        document.getElementById('quizPlaySection').style.display = 'block';

        document.getElementById('activeQuizTitle').textContent = quiz.title;
        const subjectMap = {
          "science": "विज्ञान",
          "maths": "गणित",
          "social-science": "सामाजिक विज्ञान",
          "hindi": "हिन्दी",
          "english": "अंग्रेजी"
        };
        document.getElementById('activeQuizSubtitle').textContent = `${subjectMap[quiz.subjectId] || 'मॉक टेस्ट'} | कक्षा 10 यूपी बोर्ड`;

        loadQuestion();
        startQuizTimer();
      } else {
        alert("टेस्ट नहीं मिला!");
      }
    }
  } catch (err) {
    alert("सर्वर ऑफलाइन है!");
  }
};

window.openDirectSubject = function(subjectId) {
  // Check if user is logged in
  if (!state.user) {
    alert("कृपया पहले लॉगिन करें!");
    showAuthScreen();
    return;
  }

  // Auto enroll in free sankalp-batch if not already enrolled
  if (!state.enrolledBatches.includes('sankalp-batch')) {
    state.enrolledBatches.push('sankalp-batch');
    saveState();
  }

  // Set selected subject active
  activeSubjectId = subjectId;
  activeChapterIndex = 0;

  // Open the batches tab which displays classroom
  switchTab('batches');
  renderClassroom();
};

window.loadAdminContentManager = async function() {
  const container = document.getElementById('adminContentManagerList');
  if (!container) return;
  container.innerHTML = '<p style="padding: 10px; font-size:12px; color: var(--text-secondary);">लोड हो रहा है...</p>';

  let itemsHtml = '';
  const subjectNames = {
    'science': 'विज्ञान',
    'maths': 'गणित',
    'social-science': 'सामाजिक विज्ञान',
    'hindi': 'हिन्दी',
    'english': 'अंग्रेजी'
  };

  let hasItems = false;

  // Render notes and lectures
  Object.keys(mockData.subjects).forEach(subId => {
    const subject = mockData.subjects[subId];
    if (subject.chapters) {
      subject.chapters.forEach(ch => {
        ch.lectures.forEach(lec => {
          if (lec.id.startsWith('lec-')) {
            hasItems = true;
            itemsHtml += `
              <div class="admin-log-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); margin-bottom: 8px;">
                <div>
                  <span style="font-size: 11px; color: var(--accent-saffron); font-weight: bold;">📽️ लेक्चर | ${subjectNames[subId] || subId}</span>
                  <h4 style="font-size: 13px; margin: 4px 0; color: var(--text-primary);">${ch.title} - ${lec.title}</h4>
                </div>
                <button onclick="deleteAdminItem('${subId}', '${ch.id}', 'lecture', '${lec.id}')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash-can"></i> हटाएं</button>
              </div>
            `;
          }
        });

        ch.notes.forEach(note => {
          if (note.id.startsWith('note-') || note.id.startsWith('custom-')) {
            hasItems = true;
            itemsHtml += `
              <div class="admin-log-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); margin-bottom: 8px;">
                <div>
                  <span style="font-size: 11px; color: var(--accent-saffron); font-weight: bold;">📄 नोट्स | ${subjectNames[subId] || subId}</span>
                  <h4 style="font-size: 13px; margin: 4px 0; color: var(--text-primary);">${ch.title} - ${note.title}</h4>
                </div>
                <button onclick="deleteAdminItem('${subId}', '${ch.id}', 'note', '${note.id}')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash-can"></i> हटाएं</button>
              </div>
            `;
          }
        });
      });
    }
  });

  // Render custom quizzes
  try {
    const response = await fetch(`${API_URL}/api/quizzes`);
    if (response.ok) {
      const quizzes = await response.json();
      quizzes.forEach(q => {
        hasItems = true;
        itemsHtml += `
          <div class="admin-log-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); margin-bottom: 8px;">
            <div>
              <span style="font-size: 11px; color: var(--accent-saffron); font-weight: bold;">📝 टेस्ट | ${subjectNames[q.subjectId] || q.subjectId}</span>
              <h4 style="font-size: 13px; margin: 4px 0; color: var(--text-primary);">${q.title}</h4>
            </div>
            <button onclick="deleteAdminQuiz('${q.id}')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash-can"></i> हटाएं</button>
          </div>
        `;
      });
    }
  } catch(e) {}

  if (!hasItems) {
    container.innerHTML = '<p style="padding: 15px; font-size:12px; text-align:center; color: var(--text-muted);">कोई भी कस्टम अपलोडेड सामग्री उपलब्ध नहीं है।</p>';
  } else {
    container.innerHTML = itemsHtml;
  }
};

window.deleteAdminItem = async function(subjectId, chapterId, type, itemId) {
  if (!confirm("क्या आप वाकई इसे डिलीट करना चाहते हैं?")) return;
  try {
    const response = await fetch(`${API_URL}/api/admin/delete-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId, chapterId, type, itemId })
    });
    if (response.ok) {
      alert("सामग्री सफलतापूर्वक हटा दी गई है!");
      await syncCustomContent();
      loadAdminContentManager();
    } else {
      alert("हटाने में विफल!");
    }
  } catch (err) {
    alert("सर्वर ऑफलाइन है!");
  }
};

window.deleteAdminQuiz = async function(quizId) {
  if (!confirm("क्या आप वाकई इस टेस्ट को डिलीट करना चाहते हैं?")) return;
  try {
    const response = await fetch(`${API_URL}/api/admin/delete-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId })
    });
    if (response.ok) {
      alert("टेस्ट सफलतापूर्वक हटा दिया गया है!");
      loadAdminContentManager();
      if (typeof initQuizExplorer === 'function') initQuizExplorer();
    } else {
      alert("हटाने में विफल!");
    }
  } catch (err) {
    alert("सर्वर ऑफलाइन है!");
  }
};

let activeBookSubjectId = 'maths';

window.initBooksExplorer = function() {
  const tabsContainer = document.getElementById('bookSubjectTabs');
  const container = document.getElementById('bookChaptersContainer');
  if (!tabsContainer || !container) return;

  tabsContainer.innerHTML = '';
  
  const subjects = {
    'maths': { title: '📐 गणित (Maths)', icon: '📐' },
    'science': { title: '🧪 विज्ञान (Science)', icon: '🧪' },
    'social-science': { title: '🌍 सा. विज्ञान', icon: '🌍' },
    'hindi': { title: '✍️ हिन्दी', icon: '✍️' },
    'english': { title: '📖 अंग्रेजी', icon: '📖' }
  };

  Object.keys(subjects).forEach(subId => {
    const sub = subjects[subId];
    const button = document.createElement('button');
    button.className = `sub-tab ${activeBookSubjectId === subId ? 'active' : ''}`;
    button.innerHTML = `<span>${sub.icon}</span> ${sub.title.split(' ')[1] || sub.title}`;
    button.onclick = () => {
      activeBookSubjectId = subId;
      initBooksExplorer();
    };
    tabsContainer.appendChild(button);
  });

  const subjectNames = {
    'maths': 'गणित (Mathematics)',
    'science': 'विज्ञान (Science)',
    'social-science': 'सामाजिक विज्ञान (Social Science)',
    'hindi': 'हिन्दी (Hindi)',
    'english': 'अंग्रेजी (English)'
  };
  document.getElementById('activeBookSubjectTitle').textContent = `${subjectNames[activeBookSubjectId]} - NCERT डिजिटल पुस्तक`;

  renderBookSubjectChapters(activeBookSubjectId);
};

function renderBookSubjectChapters(subjectId) {
  const container = document.getElementById('bookChaptersContainer');
  if (!container) return;
  container.innerHTML = '';

  const mathBookFiles = ['11.pdf', '22.pdf', '33.pdf', '44.pdf', '55.pdf', '66.pdf', '77.pdf', '88.pdf', '99.pdf', '10.pdf', '111.pdf', '222.pdf', '333.pdf', '444.pdf', '555.pdf'];

  const subject = mockData.subjects[subjectId];
  if (!subject || !subject.chapters || subject.chapters.length === 0) {
    container.innerHTML = `<p style="padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); grid-column: 1/-1;">इस विषय की NCERT बुक पीडीएफ जल्द ही ऑनलाइन उपलब्ध होगी।</p>`;
    return;
  }

  subject.chapters.forEach((ch, index) => {
    const card = document.createElement('div');
    card.className = 'notes-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.justifyContent = 'space-between';
    card.style.height = '100%';

    // Title parsing
    const chNum = ch.title.split(':')[0] || `अध्याय ${index + 1}`;
    const chName = ch.title.substring(ch.title.indexOf(':') + 1).trim() || ch.title;

    let actionButton = '';
    if (subjectId === 'maths' && index < mathBookFiles.length) {
      const pdfPath = `books/maths/${mathBookFiles[index]}`;
      actionButton = `
        <button class="btn btn-primary btn-block" onclick="openBookPDF('${pdfPath}', '${ch.title}')" style="margin-top: auto; font-size:12px; padding: 8px;">
          <i class="fa-solid fa-file-pdf"></i> पुस्तक पढ़ें (Offline PDF)
        </button>
      `;
    } else {
      actionButton = `
        <button class="btn btn-secondary btn-block" disabled style="margin-top: auto; font-size:12px; padding: 8px; opacity: 0.6;">
          <i class="fa-solid fa-lock"></i> शीघ्र ही उपलब्ध
        </button>
      `;
    }

    card.innerHTML = `
      <div style="margin-bottom: 12px;">
        <span style="font-size: 11px; color: var(--accent-saffron); font-weight: bold; text-transform: uppercase;">${chNum}</span>
        <h4 style="font-size: 14px; color: var(--text-primary); font-weight: 700; margin: 4px 0 8px 0; line-height: 1.4;">${chName}</h4>
        <p style="font-size: 11px; color: var(--text-muted);">आधिकारिक NCERT पाठ्यपुस्तक अध्याय</p>
      </div>
      ${actionButton}
    `;

    container.appendChild(card);
  });
}

window.openBookPDF = function(pdfPath, title) {
  pdfReaderBackTab = 'books';
  const reader = document.getElementById('pdfReaderSection');
  const readerTitle = document.getElementById('pdfTitle');
  const listSection = document.getElementById('notesListSection');

  if (!reader || !readerTitle) return;

  const viewBooks = document.getElementById('view-books');
  if (viewBooks) viewBooks.style.display = 'none';
  if (listSection) listSection.style.display = 'none';

  reader.style.display = 'flex';
  readerTitle.textContent = title + " - NCERT Book";

  // Use the local file path directly if we want offline assets, or server URL
  // Since we package books in the assets under books/maths/..., the path is books/maths/11.pdf
  // To keep it 100% offline, let's load it locally!
  renderPDFOffline(pdfPath);
};

window.renderPDFOffline = function(pdfUrl) {
  const container = document.getElementById('pdfContentBody');
  if (!container) return;
  
  // Show premium loader
  container.innerHTML = `
    <div style="text-align:center; padding:35px 20px; color:var(--text-secondary);">
      <div class="spinner" style="border: 3px solid rgba(255,111,0,0.1); border-top: 3px solid var(--accent-saffron); border-radius: 50%; width: 35px; height: 35px; animation: spin 1s linear infinite; margin: 0 auto 15px auto;"></div>
      किताब लोड हो रही है, कृपया प्रतीक्षा करें...
      <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">(PDF is loading client-side inside the app)</p>
    </div>
    <style>
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  `;

  try {
    // Configure PDF.js worker to run completely offline/client-side
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    
    pdfjsLib.getDocument(pdfUrl).promise.then(function(pdf) {
      container.innerHTML = ''; // Clear loading spinner
      
      // Load and render all pages of the book chapter sequentially
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page-container';
        pageDiv.style.marginBottom = '20px';
        pageDiv.style.backgroundColor = '#ffffff';
        pageDiv.style.borderRadius = '8px';
        pageDiv.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
        pageDiv.style.overflow = 'hidden';
        pageDiv.style.display = 'flex';
        pageDiv.style.flexDirection = 'column';
        pageDiv.style.alignItems = 'center';
        pageDiv.style.padding = '10px';
        
        const pageLabel = document.createElement('div');
        pageLabel.style.fontSize = '11px';
        pageLabel.style.color = '#555555';
        pageLabel.style.marginBottom = '5px';
        pageLabel.textContent = `पेज ${pageNum} / ${pdf.numPages}`;
        pageDiv.appendChild(pageLabel);

        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.borderRadius = '4px';
        pageDiv.appendChild(canvas);
        container.appendChild(pageDiv);

        pdf.getPage(pageNum).then(function(page) {
          const viewport = page.getViewport({ scale: 1.5 });
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          page.render(renderContext);
        });
      }
    }).catch(function(err) {
      console.error("PDF.js loading error:", err);
      // Fallback: If it's a relative path, try rendering via online server URL
      if (!pdfUrl.startsWith('http')) {
        const serverPdfUrl = `https://gyanoday-learning-app.onrender.com/${pdfUrl}`;
        renderPDFOffline(serverPdfUrl);
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--accent-live);">
            <p>पीडीएफ लोड करने में विफल! इंटरनेट कनेक्शन चेक करें या बाहरी ब्राउज़र में खोलें:</p>
            <a href="${pdfUrl}" target="_blank" class="btn btn-primary" style="margin-top: 15px; display:inline-block; font-size:12px;">
              <i class="fa-solid fa-up-right-from-square"></i> ब्राउज़र में खोलें
            </a>
          </div>
        `;
      }
    });
  } catch (err) {
    console.error("PDF.js initialization error:", err);
    container.innerHTML = `
      <div style="text-align:center; padding:30px; color:var(--accent-live);">
        <p>पीडीएफ लाइब्रेरी लोड नहीं हो पाई!</p>
        <a href="${pdfUrl}" target="_blank" class="btn btn-primary" style="margin-top: 15px; display:inline-block; font-size:12px;">
          <i class="fa-solid fa-up-right-from-square"></i> बाहरी ब्राउज़र में खोलें
        </a>
      </div>
    `;
  }
};

