// Configuration
const NUM_CANDLES = 5;
const BLOW_THRESHOLD = 40; // Volume threshold (0-255) - lowered for easier detection
const BLOW_FREQUENCY_MIN = 50; // Minimum frequency for blow detection (Hz)
const BLOW_FREQUENCY_MAX = 500; // Maximum frequency for blow detection (Hz)
const BLOW_DURATION = 200; // Minimum duration in ms for a valid blow - reduced for easier detection

// State
let audioContext = null;
let analyser = null;
let microphone = null;
let dataArray = null;
let stream = null;
let isListening = false;
let candles = [];
let litCandles = NUM_CANDLES;
let blowStartTime = null;
let animationFrameId = null;
let currentBlowIntensity = 0;
let isBlowing = false;

// DOM elements
const candlesContainer = document.getElementById('candlesContainer');
const celebrationMessage = document.getElementById('celebrationMessage');
const confettiContainer = document.getElementById('confettiContainer');
const cakeName = document.getElementById('cakeName');
const micButton = document.getElementById('micButton');

// Initialize candles
function createCandles() {
    candlesContainer.innerHTML = '';
    candles = [];
    litCandles = NUM_CANDLES;
    
    for (let i = 0; i < NUM_CANDLES; i++) {
        const candle = document.createElement('div');
        candle.className = 'candle';
        candle.id = `candle-${i}`;
        
        // Add wick glow
        const wickGlow = document.createElement('div');
        wickGlow.className = 'wick-glow';
        
        const flame = document.createElement('div');
        flame.className = 'flame';
        flame.id = `flame-${i}`;
        
        candle.appendChild(wickGlow);
        candle.appendChild(flame);
        candlesContainer.appendChild(candle);
        
        candles.push({
            element: candle,
            flame: flame,
            wickGlow: wickGlow,
            isLit: true,
            index: i
        });
    }
    
    updateCandlesStatus();
}

// Update candles status display
function updateCandlesStatus() {
    if (litCandles === 0) {
        triggerCelebration();
    }
}

// Start microphone - triggered by button (always prompts for device selection)
async function startMicrophone() {
    try {
        // Stop existing stream if any
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        // Stop listening
        isListening = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        // Close existing audio context
        if (audioContext) {
            await audioContext.close();
            audioContext = null;
        }
        
        // Request microphone access with deviceId constraint to force device selection
        // Using a unique constraint each time to ensure browser shows device picker
        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                // Don't specify deviceId to allow user to choose
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Create new audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        
        // Connect microphone to analyser
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        // Create data array
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Keep button visible so user can change microphone
        // Don't hide it - let them click again to change device
        
        isListening = true;
        startListening();
        
        console.log('✅ Microphone ready! Blow into your microphone to blow out the candles! 💨');
        
        // Update button text
        if (micButton) {
            micButton.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i><span>Change Microphone</span>';
        }
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('Please allow microphone access to blow out the candles! Click the button again and select "Allow".');
        } else if (error.name === 'NotFoundError') {
            alert('No microphone found. Please connect a microphone.');
        } else {
            alert('Error accessing microphone: ' + error.message);
        }
    }
}

// Add button click listener
if (micButton) {
    micButton.addEventListener('click', () => {
        if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            startMicrophone();
        } else {
            alert('Microphone requires HTTPS or localhost. Please run this page via a local server.');
        }
    });
}

// Start listening for audio
function startListening() {
    if (!isListening) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    // Analyze audio for blow detection and intensity
    const blowResult = detectBlow(dataArray);
    const blowDetected = blowResult.detected;
    currentBlowIntensity = blowResult.intensity;
    
    // Apply wind effects based on blow intensity
    if (currentBlowIntensity > BLOW_THRESHOLD * 0.5) {
        applyWindEffects(currentBlowIntensity);
        isBlowing = true;
    } else {
        removeWindEffects();
        isBlowing = false;
    }
    
    if (blowDetected && litCandles > 0) {
        blowOutCandle();
    }
    
    animationFrameId = requestAnimationFrame(startListening);
}

// Detect blow in audio data
function detectBlow(dataArray) {
    // Calculate average volume in the blow frequency range
    const sampleRate = audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const frequencyResolution = nyquist / dataArray.length;
    
    // Find frequency range for blow detection (typically 50-500 Hz)
    const startIndex = Math.floor(BLOW_FREQUENCY_MIN / frequencyResolution);
    const endIndex = Math.floor(BLOW_FREQUENCY_MAX / frequencyResolution);
    
    let sum = 0;
    let count = 0;
    let maxVolume = 0;
    
    for (let i = startIndex; i <= endIndex && i < dataArray.length; i++) {
        sum += dataArray[i];
        if (dataArray[i] > maxVolume) {
            maxVolume = dataArray[i];
        }
        count++;
    }
    
    const averageVolume = count > 0 ? sum / count : 0;
    // Use a combination of average and max for intensity
    const intensity = Math.max(averageVolume, maxVolume * 0.7);
    
    // Check if volume exceeds threshold
    if (intensity > BLOW_THRESHOLD) {
        if (blowStartTime === null) {
            blowStartTime = Date.now();
        }
        
        const blowDuration = Date.now() - blowStartTime;
        
        // Require sustained blow for a minimum duration
        if (blowDuration >= BLOW_DURATION) {
            return { detected: true, intensity: intensity };
        }
    } else {
        // Reset if volume drops below threshold
        blowStartTime = null;
    }
    
    return { detected: false, intensity: intensity };
}

// Apply wind effects to candles based on blow intensity
function applyWindEffects(intensity) {
    const intensityRatio = Math.min(intensity / 255, 1); // Normalize to 0-1
    const windStrength = intensityRatio * 100; // 0-100%
    
    candles.forEach(candle => {
        if (candle.isLit) {
            // Add wind class for CSS animations
            candle.element.classList.add('wind-blowing');
            candle.flame.classList.add('wind-blowing');
            
            // Apply dynamic wind effects based on intensity
            const swayAmount = windStrength * 0.03; // Max 3 degrees
            const randomOffset = (Math.random() - 0.5) * 2; // -1 to 1
            candle.element.style.transform = `rotate(${swayAmount * randomOffset}deg)`;
            
            // Make flame lean more with stronger wind
            const flameLean = windStrength * 0.15; // Max 15px
            const flameScale = 1 - (windStrength * 0.003); // Slightly compress
            candle.flame.style.transform = `translateX(-50%) translateX(${flameLean * randomOffset}px) scaleY(${flameScale}) scaleX(${1 + windStrength * 0.003}) rotate(${windStrength * 0.1 * randomOffset}deg)`;
            
            // Increase flame flicker with wind
            candle.flame.style.animationDuration = `${0.15 - (windStrength * 0.001)}s`;
            
            // Adjust glow intensity
            candle.wickGlow.style.opacity = 0.4 + (windStrength * 0.004);
        }
    });
}

// Remove wind effects when not blowing
function removeWindEffects() {
    candles.forEach(candle => {
        if (candle.isLit) {
            candle.element.classList.remove('wind-blowing');
            candle.flame.classList.remove('wind-blowing');
            candle.element.style.transform = '';
            candle.flame.style.transform = '';
            candle.flame.style.animationDuration = '';
            candle.wickGlow.style.opacity = '';
        }
    });
}

// Blow out a candle
function blowOutCandle() {
    // Find first lit candle
    const litCandle = candles.find(c => c.isLit);
    
    if (!litCandle) return;
    
    // Mark as extinguished
    litCandle.isLit = false;
    litCandles--;
    
    // Remove wind effects from this candle
    litCandle.element.classList.remove('wind-blowing');
    litCandle.flame.classList.remove('wind-blowing');
    
    // Get candle position for sparkle effect
    const rect = litCandle.element.getBoundingClientRect();
    const sparkleX = rect.left + rect.width / 2;
    const sparkleY = rect.top;
    
    // Create minimal sparkles around the candle
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            createSparkle(
                sparkleX + (Math.random() - 0.5) * 30,
                sparkleY + (Math.random() - 0.5) * 20
            );
        }, i * 80);
    }
    
    // Animate flame going out with wind effect
    litCandle.flame.classList.add('extinguishing');
    litCandle.wickGlow.style.opacity = '0';
    litCandle.wickGlow.style.transition = 'opacity 0.3s ease-out';
    
    // Remove flame after animation
    setTimeout(() => {
        litCandle.flame.style.display = 'none';
        litCandle.wickGlow.style.display = 'none';
        updateCandlesStatus();
        
        // Reset blow detection
        blowStartTime = null;
    }, 800);
}

// Trigger celebration
function triggerCelebration() {
    // Stop listening
    isListening = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    // Show celebration message
    setTimeout(() => {
        celebrationMessage.classList.add('show');
    }, 500);
    
    // Create confetti
    createConfetti();
    
    // Stop microphone stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

// Create sparkle effect (minimal)
function createSparkle(x, y) {
    const sparkle = document.createElement('div');
    const colors = ['#FF79A8', '#FFA28A', '#FFDDE8', '#FF5A8F'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    sparkle.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 6px;
        background: ${color};
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        animation: sparklePop 0.6s ease-out forwards;
        box-shadow: 0 0 8px ${color};
    `;
    document.body.appendChild(sparkle);
    
    setTimeout(() => {
        sparkle.remove();
    }, 600);
}

// Add sparkle animation
const sparkleStyle = document.createElement('style');
sparkleStyle.textContent = `
    @keyframes sparklePop {
        0% {
            transform: scale(0);
            opacity: 1;
        }
        50% {
            transform: scale(1);
            opacity: 1;
        }
        100% {
            transform: scale(0);
            opacity: 0;
        }
    }
`;
document.head.appendChild(sparkleStyle);

// Create confetti effect
function createConfetti() {
    const colors = ['#FF79A8', '#FFA28A', '#FFDDE8', '#FF5A8F', '#FF8C6B', '#FFF5F8'];
    const numConfetti = 150;
    
    for (let i = 0; i < numConfetti; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (2 + Math.random() * 3) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confettiContainer.appendChild(confetti);
            
            // Remove confetti after animation
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }, i * 8);
    }
    
}

// Create snow falling background
function createSnowBackground() {
    const snowBg = document.getElementById('snowBackground');
    if (!snowBg) {
        console.error('❌ Snow background element not found!');
        return;
    }
    
    // Clear any existing snowflakes
    snowBg.innerHTML = '';
    
    // Snowflake characters - using emojis for better visibility
    const snowflakes = ['❄', '❅', '❆', '❄', '❅', '❆'];
    
    // Create snowflakes for a romantic effect - fewer and more spaced out
    const numSnowflakes = 60; // Reduced from 150
    for (let i = 0; i < numSnowflakes; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
        // Space them out more horizontally - use larger intervals
        snowflake.style.left = (Math.random() * 100) + '%';
        // Start at different heights so they're visible immediately - more spread out
        const startHeight = Math.random() * -1000 - 200; // More spread out vertically
        snowflake.style.top = startHeight + 'px';
        snowflake.style.opacity = '1'; // Always fully visible
        // No delay for falling animation - start immediately, only delay blink
        const fallDuration = (Math.random() * 12 + 15) + 's'; // Slower fall for more spacing
        const blinkDuration = (Math.random() * 1 + 1.5) + 's';
        const blinkDelay = (Math.random() * 2) + 's';
        snowflake.style.animation = `snowFall ${fallDuration} linear infinite, snowBlink ${blinkDuration} ease-in-out infinite`;
        snowflake.style.animationDelay = `0s, ${blinkDelay}`;
        snowflake.style.fontSize = (Math.random() * 10 + 28) + 'px'; // 28-38px
        snowflake.style.zIndex = '1';
        snowflake.style.color = '#FFFFFF';
        snowflake.style.filter = 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.9))';
        snowBg.appendChild(snowflake);
    }
    
    console.log('✅ Snow background created with', snowBg.children.length, 'snowflakes');
    console.log('👀 Snowflakes should be visible - white falling from top');
    
    // Verify snowflakes are in DOM
    setTimeout(() => {
        const flakes = snowBg.querySelectorAll('.snowflake');
        console.log('🔍 Found', flakes.length, 'snowflakes in DOM');
        if (flakes.length > 0) {
            console.log('✅ First snowflake styles:', window.getComputedStyle(flakes[0]));
        }
    }, 100);
}

// Initialize on page load
window.addEventListener('load', () => {
    createCandles();
    createSnowBackground();
    
    // Set default name to "bb"
    // Name is set in HTML - don't override it
    // if (cakeName) {
    //     cakeName.textContent = 'Happy Birthday bb!';
    // }
    
    // Show microphone button if on HTTPS or localhost
    if (micButton) {
        if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            micButton.classList.remove('hidden');
        } else {
            micButton.classList.add('hidden');
            console.log('Microphone requires HTTPS or localhost to blow out candles');
        }
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
});

