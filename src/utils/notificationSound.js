/**
 * Utility functions for generating and playing notification sounds
 */

// Global flag to prevent overlapping sounds
let isPlayingNotification = false

/**
 * Generate a simple notification beep sound using Web Audio API
 * @param {number} frequency - Frequency of the beep (default: 800Hz)
 * @param {number} duration - Duration in milliseconds (default: 200ms)
 * @param {number} volume - Volume level 0-1 (default: 0.3)
 */
export const generateNotificationBeep = (frequency = 800, duration = 200, volume = 0.3) => {
  // Prevent overlapping sounds
  if (isPlayingNotification) {
    console.log('🔇 Beep skipped (already playing)')
    return
  }

  try {
    isPlayingNotification = true
    
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) {
      console.warn('⚠️ Web Audio API not supported')
      return
    }
    
    const audioContext = new AudioContext()
    
    // Create oscillator for the beep
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    // Connect nodes
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Configure oscillator
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
    oscillator.type = 'sine'
    
    // Configure gain (volume)
    gainNode.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000)
    
    // Play the beep
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + duration / 1000)
    
    // Reset flag after sound completes
    setTimeout(() => {
      isPlayingNotification = false
    }, duration + 100)
    
    console.log('🔊 Notification beep played')
  } catch (error) {
    console.warn('⚠️ Failed to generate notification beep:', error)
    isPlayingNotification = false
  }
}

/**
 * Generate a double beep notification sound
 * @param {number} volume - Volume level 0-1 (default: 0.3)
 */
export const generateDoubleBeep = (volume = 0.3) => {
  // Prevent overlapping sounds
  if (isPlayingNotification) {
    console.log('🔇 Double beep skipped (already playing)')
    return
  }

  try {
    isPlayingNotification = true
    
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const audioContext = new AudioContext()
    
    // First beep
    const oscillator1 = audioContext.createOscillator()
    const gainNode1 = audioContext.createGain()
    
    oscillator1.connect(gainNode1)
    gainNode1.connect(audioContext.destination)
    
    oscillator1.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator1.type = 'sine'
    
    gainNode1.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode1.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01)
    gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
    
    oscillator1.start(audioContext.currentTime)
    oscillator1.stop(audioContext.currentTime + 0.1)
    
    // Second beep (after a short pause)
    setTimeout(() => {
      const oscillator2 = audioContext.createOscillator()
      const gainNode2 = audioContext.createGain()
      
      oscillator2.connect(gainNode2)
      gainNode2.connect(audioContext.destination)
      
      oscillator2.frequency.setValueAtTime(1000, audioContext.currentTime)
      oscillator2.type = 'sine'
      
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode2.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01)
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15)
      
      oscillator2.start(audioContext.currentTime)
      oscillator2.stop(audioContext.currentTime + 0.15)
    }, 150)
    
    // Reset flag after sound completes
    setTimeout(() => {
      isPlayingNotification = false
    }, 400) // Total duration of double beep
    
    console.log('🔊 Double notification beep played')
  } catch (error) {
    console.warn('⚠️ Failed to generate double beep:', error)
    isPlayingNotification = false
  }
}

/**
 * Generate a notification sound with multiple frequencies (more pleasant)
 * @param {number} volume - Volume level 0-1 (default: 0.3)
 */
export const generatePleasantNotification = (volume = 0.3, audioContext = null) => {
  // Prevent overlapping sounds
  if (isPlayingNotification) {
    console.log('🔇 Notification skipped (already playing)')
    return
  }

  try {
    isPlayingNotification = true
    
    // Use provided audio context or create new one
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) {
        console.warn('⚠️ Web Audio API not supported')
        isPlayingNotification = false
        return
      }
      audioContext = new AudioContext()
    }
    
    // Create a pleasant chord-like sound
    const frequencies = [523, 659, 784] // C5, E5, G5 chord
    const oscillators = []
    const gainNodes = []
    
    frequencies.forEach((freq, index) => {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime)
      oscillator.type = 'sine'
      
      // Stagger the start times slightly for a chord effect
      const startTime = audioContext.currentTime + (index * 0.02)
      const endTime = startTime + 0.3
      
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(volume * 0.3, startTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, endTime)
      
      oscillator.start(startTime)
      oscillator.stop(endTime)
      
      oscillators.push(oscillator)
      gainNodes.push(gainNode)
    })
    
    // Reset flag after sound completes
    setTimeout(() => {
      isPlayingNotification = false
    }, 400) // Slightly longer than the sound duration
    
    console.log('🔊 Pleasant notification sound played')
  } catch (error) {
    console.warn('⚠️ Failed to generate pleasant notification:', error)
    isPlayingNotification = false
  }
}
