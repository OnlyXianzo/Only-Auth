import fs from 'fs';
import path from 'path';

function findFile(dir: string, fileName: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const found = findFile(filePath, fileName);
      if (found) return found;
    } else if (file === fileName) {
      return filePath;
    }
  }
  return null;
}

const androidDir = path.resolve(__dirname, '../src-tauri/gen/android');

console.log('Searching for Android project files under:', androidDir);

if (!fs.existsSync(androidDir)) {
  console.error('\n[ERROR] src-tauri/gen/android directory not found.');
  console.error('Please run "bunx tauri android init" first on a system with Android SDK/NDK.');
  process.exit(1);
}

// 1. Patch AndroidManifest.xml
const manifestPath = findFile(androidDir, 'AndroidManifest.xml');
if (manifestPath) {
  console.log('Found AndroidManifest.xml at:', manifestPath);
  let content = fs.readFileSync(manifestPath, 'utf8');

  // Check if camera permission is already there
  if (!content.includes('android.permission.CAMERA')) {
    const permissionTag = `\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />`;
    // Insert after <manifest ...>
    content = content.replace(/(<manifest[^>]*>)/, `$1${permissionTag}`);
    fs.writeFileSync(manifestPath, content, 'utf8');
    console.log('Successfully added Camera permission to AndroidManifest.xml');
  } else {
    console.log('Camera permission already exists in AndroidManifest.xml');
  }
} else {
  console.error('[ERROR] AndroidManifest.xml not found.');
}

// 2. Patch MainActivity.kt
const activityPath = findFile(androidDir, 'MainActivity.kt');
if (activityPath) {
  console.log('Found MainActivity.kt at:', activityPath);
  
  const patchedActivity = `package com.onlyauth.app

import android.os.Bundle
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import app.tauri.plugin.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 1. Screenshot/Screen-Capture Protection (FLAG_SECURE)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        // 2. WebView Camera Permission Bridge
        val webView = this.webview ?: return
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val cameraGranted = ContextCompat.checkSelfPermission(
                        this@MainActivity, Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED

                    val grantedResources = mutableListOf<String>()
                    request.resources.forEach { resource ->
                        if (resource == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                            if (cameraGranted) {
                                grantedResources.add(resource)
                            } else {
                                // Request permission at runtime
                                androidx.core.app.ActivityCompat.requestPermissions(
                                    this@MainActivity,
                                    arrayOf(Manifest.permission.CAMERA),
                                    1001
                                )
                            }
                        }
                    }

                    if (grantedResources.isNotEmpty()) {
                        request.grant(grantedResources.toTypedArray())
                    } else {
                        request.deny()
                    }
                }
            }
        }
    }
}
`;
  fs.writeFileSync(activityPath, patchedActivity, 'utf8');
  console.log('Successfully patched MainActivity.kt with FLAG_SECURE and camera permission bridge.');
} else {
  console.error('[ERROR] MainActivity.kt not found.');
}
