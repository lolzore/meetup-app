@echo off
REM Builds the Android app (APK) on Windows.
REM Needs: Node.js 22+, Python 3, JDK 21, and the Android SDK (installed with Android Studio).
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install || goto :fail
)
echo Building the app page...
python scripts\build.py || goto :fail
call npx cap sync android || goto :fail
if "%ANDROID_HOME%"=="" if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if "%JAVA_HOME%"=="" if exist "%ProgramFiles%\Android\Android Studio\jbr" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
cd android
call gradlew.bat assembleDebug || goto :fail
cd ..
copy /y android\app\build\outputs\apk\debug\app-debug.apk albania-meetup.apk >nul
echo.
echo Done: albania-meetup.apk is in this folder. Send it to Android phones and open it to install.
pause
exit /b 0
:fail
echo.
echo The build stopped with an error (see above). Opening the "android" folder in Android Studio and choosing
echo Build ^> Build App Bundle(s) / APK(s) ^> Build APK(s) usually sorts out missing SDK parts automatically.
pause
exit /b 1
