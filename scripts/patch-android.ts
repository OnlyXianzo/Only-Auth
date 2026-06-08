import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively search for a file in a directory.
 * @param dir The directory to search.
 * @param fileName The name of the file to find.
 */
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

// skipcq: JS-0002
console.log('Searching for Android project files under:', androidDir);

if (!fs.existsSync(androidDir)) {
  // skipcq: JS-0002
  console.error('\n[ERROR] src-tauri/gen/android directory not found.');
  // skipcq: JS-0002
  console.error('Please run "bunx tauri android init" first on a system with Android SDK/NDK.');
  process.exit(1);
}

// 1. Patch AndroidManifest.xml
const manifestPath = findFile(androidDir, 'AndroidManifest.xml');
if (manifestPath) {
  // skipcq: JS-0002
  console.log('Found AndroidManifest.xml at:', manifestPath);
  let content = fs.readFileSync(manifestPath, 'utf8');

  // Check if camera permission is already there
  if (!content.includes('android.permission.CAMERA')) {
    const permissionTag = "\n    <uses-permission android:name=\"android.permission.CAMERA\" />\n    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />";
    // Insert after <manifest ...>
    content = content.replace(/(<manifest[^>]*>)/, `$1${permissionTag}`);
    fs.writeFileSync(manifestPath, content, 'utf8');
    // skipcq: JS-0002
    console.log('Successfully added Camera permission to AndroidManifest.xml');
  } else {
    // skipcq: JS-0002
    console.log('Camera permission already exists in AndroidManifest.xml');
  }
} else {
  // skipcq: JS-0002
  console.error('[ERROR] AndroidManifest.xml not found.');
}

// 2. Patch MainActivity.kt
const activityPath = findFile(androidDir, 'MainActivity.kt');
if (activityPath) {
  // skipcq: JS-0002
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
  // skipcq: JS-0002
  console.log('Successfully patched MainActivity.kt with FLAG_SECURE and camera permission bridge.');
} else {
  // skipcq: JS-0002
  console.error('[ERROR] MainActivity.kt not found.');
}

// 3. Patch build.gradle.kts to update Kotlin version to 2.1.0
const gradlePath = path.join(androidDir, 'build.gradle.kts');
if (fs.existsSync(gradlePath)) {
  // skipcq: JS-0002
  console.log('Found build.gradle.kts at:', gradlePath);
  let content = fs.readFileSync(gradlePath, 'utf8');

  // Replace org.jetbrains.kotlin.android version to 2.1.0
  const updatedContent = content.replace(
    /id\("org\.jetbrains\.kotlin\.android"\)\s*version\s*"[^"]+"/,
    'id("org.jetbrains.kotlin.android") version "2.1.0"'
  );

  if (updatedContent !== content) {
    fs.writeFileSync(gradlePath, updatedContent, 'utf8');
    // skipcq: JS-0002
    console.log('Successfully upgraded Kotlin version to 2.1.0 in build.gradle.kts');
  } else {
    // skipcq: JS-0002
    console.log('Kotlin version was not found or already updated in build.gradle.kts');
  }
} else {
  // skipcq: JS-0002
  console.error('[ERROR] build.gradle.kts not found at:', gradlePath);
}
