import os
import subprocess
import shutil

import socket

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

LOCAL_IP = get_local_ip()
print(f"Detected Local IP for Android app: {LOCAL_IP}")

# Paths configuration
GRADLE_PATH = r"C:\Users\dines\.gemini\antigravity\scratch\gradle-dist\gradle-8.5\bin\gradle.bat"
JAVA_HOME = r"C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
ANDROID_HOME = r"C:\Users\dines\AppData\Local\Android\Sdk"
ADB_PATH = r"C:\Users\dines\.gemini\antigravity\scratch\platform-tools-dist\platform-tools\adb.exe"

PROJECT_DIR = r"C:\Users\dines\.gemini\antigravity\scratch\dj-academy-android"

# Setup Android build environment variables
env = os.environ.copy()
env["JAVA_HOME"] = JAVA_HOME
env["ANDROID_HOME"] = ANDROID_HOME

def make_project():
    print("Creating Android project structure...")
    os.makedirs(os.path.join(PROJECT_DIR, "app", "src", "main", "java", "com", "djacademy", "app"), exist_ok=True)
    os.makedirs(os.path.join(PROJECT_DIR, "app", "src", "main", "res", "drawable"), exist_ok=True)
    
    # 1. settings.gradle
    with open(os.path.join(PROJECT_DIR, "settings.gradle"), "w", encoding="utf-8") as f:
        f.write('rootProject.name = "DJAcademy"\ninclude ":app"\n')

    # 1.5. gradle.properties
    with open(os.path.join(PROJECT_DIR, "gradle.properties"), "w", encoding="utf-8") as f:
        f.write('android.useAndroidX=true\n')

    # 2. build.gradle (root)
    root_gradle = """
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
"""
    with open(os.path.join(PROJECT_DIR, "build.gradle"), "w", encoding="utf-8") as f:
        f.write(root_gradle)

    # 3. app/build.gradle
    app_gradle = """
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.djacademy.app'
    compileSdk 34

    defaultConfig {
        applicationId "com.djacademy.app"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
"""
    with open(os.path.join(PROJECT_DIR, "app", "build.gradle"), "w", encoding="utf-8") as f:
        f.write(app_gradle)

    # 4. AndroidManifest.xml
    manifest_xml = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application
        android:allowBackup="true"
        android:icon="@drawable/logo"
        android:roundIcon="@drawable/logo"
        android:label="DJ Academy Learning"
        android:theme="@style/Theme.AppCompat.NoActionBar"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
"""
    with open(os.path.join(PROJECT_DIR, "app", "src", "main", "AndroidManifest.xml"), "w", encoding="utf-8") as f:
        f.write(manifest_xml)

    # 5. MainActivity.java (pointing to mobile access IP)
    main_activity_java = """package com.djacademy.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        webView = new WebView(this);
        setContentView(webView);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setSupportZoom(false);
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Load the mobile IP link
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
"""
    main_activity_java = main_activity_java.replace("LOCAL_IP", f'"{LOCAL_IP}"')
    with open(os.path.join(PROJECT_DIR, "app", "src", "main", "java", "com", "djacademy", "app", "MainActivity.java"), "w", encoding="utf-8") as f:
        f.write(main_activity_java)

    # Create assets folder in Android project
    assets_dir = os.path.join(PROJECT_DIR, "app", "src", "main", "assets")
    os.makedirs(assets_dir, exist_ok=True)

    # Copy files to assets
    files_to_copy = [
        "index.html", "style.css", "app.js", "mockData.js", 
        "manifest.json", "sw.js", "banner.jpg", "logo.jpg",
        "pdf.min.js", "pdf.worker.min.js"
    ]
    for file_name in files_to_copy:
        src = os.path.join(r"C:\Users\dines\.gemini\antigravity\scratch\gyanoday-learning-app", file_name)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(assets_dir, file_name))

    # Copy books folder recursively if exists
    books_src = r"C:\Users\dines\.gemini\antigravity\scratch\gyanoday-learning-app\books"
    if os.path.exists(books_src):
        books_dest = os.path.join(assets_dir, "books")
        if os.path.exists(books_dest):
            shutil.rmtree(books_dest)
        shutil.copytree(books_src, books_dest)

    # Copy logo.jpg as launcher icon
    src_logo = r"C:\Users\dines\.gemini\antigravity\scratch\gyanoday-learning-app\logo.jpg"
    dest_res = os.path.join(PROJECT_DIR, "app", "src", "main", "res", "drawable")
    shutil.copy(src_logo, os.path.join(dest_res, "logo.jpg"))
    print("Project files and logo launcher icon generated!")

def build_and_install():
    print("Compiling Android App using Gradle (this might take a minute)...")
    # Run gradle clean assembleDebug
    process = subprocess.run([GRADLE_PATH, "clean", "assembleDebug"], cwd=PROJECT_DIR, env=env, shell=True)
    
    if process.returncode == 0:
        print("Build Succeeded!")
        apk_path = os.path.join(PROJECT_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
        if os.path.exists(apk_path):
            # Copy to the root workspace for easy access
            shutil.copy(apk_path, r"C:\Users\dines\.gemini\antigravity\scratch\gyanoday-learning-app\DJ-Academy-Learning.apk")
            print("Successfully copied compiled APK to workspace root as DJ-Academy-Learning.apk!")
            print("Installing APK directly to mobile via ADB...")
            install_proc = subprocess.run([ADB_PATH, "install", "-r", apk_path], shell=True)
            if install_proc.returncode == 0:
                print("App successfully installed on your mobile phone!")
                
                # Launch the app on phone
                print("Launching DJ Academy App on your mobile phone...")
                subprocess.run([ADB_PATH, "shell", "monkey", "-p", "com.djacademy.app", "-c", "android.intent.category.LAUNCHER", "1"], shell=True)
            else:
                print("Installation failed. Make sure USB Debugging is authorized on your phone.")
        else:
            print("APK file not found after build!")
    else:
        print("Gradle Build Failed. Check the log output above.")

if __name__ == "__main__":
    make_project()
    build_and_install()
