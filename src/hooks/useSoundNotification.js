import { useCallback, useRef, useEffect } from 'react'
import { generatePleasantNotification, generateDoubleBeep, generateNotificationBeep } from '../utils/notificationSound'

/**
 * Custom hook for playing sound notifications
 * Handles browser permissions and audio context initialization
 */
// Global audio context to prevent multiple instances
let globalAudioContext = null
let globalInitialized = false

export const useSoundNotification = () => {
  const audioContextRef = useRef(null)
  const isInitializedRef = useRef(false)

  // Initialize audio context and permissions
  const initializeAudio = useCallback(async () => {
    if (isInitializedRef.current || globalInitialized) {
      audioContextRef.current = globalAudioContext
      isInitializedRef.current = true
      return
    }

    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioContextRef.current = new AudioContext()
      globalAudioContext = audioContextRef.current

      // Resume audio context if it's suspended (required by some browsers)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      isInitializedRef.current = true
      globalInitialized = true
      console.log('🔊 Sound notification system initialized')
    } catch (error) {
      console.warn('⚠️ Failed to initialize audio:', error)
    }
  }, [])

  // Play notification sound
  const playNotification = useCallback(async () => {
    try {
      // Initialize audio if not already done
      if (!isInitializedRef.current) {
        await initializeAudio()
      }

      // Use global context if available
      const audioContext = globalAudioContext || audioContextRef.current
      
      if (!audioContext) {
        console.warn('⚠️ Audio context not available')
        return
      }

      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Play the pleasant notification sound
      console.log('🔊 Calling generatePleasantNotification with audio context:', audioContext)
      generatePleasantNotification(0.3, audioContext)
    } catch (error) {
      console.warn('⚠️ Failed to play notification sound:', error)
    }
  }, [initializeAudio])

  // Play notification with user interaction (required by some browsers)
  const playNotificationWithInteraction = useCallback(async () => {
    try {
      // Try to initialize audio context with user interaction
      if (!isInitializedRef.current) {
        await initializeAudio()
      }

      // Play the sound
      await playNotification()
    } catch (error) {
      console.warn('⚠️ Failed to play notification with interaction:', error)
    }
  }, [initializeAudio, playNotification])

  // Play different types of notifications
  const playDoubleBeep = useCallback(() => {
    generateDoubleBeep(0.3)
  }, [])

  const playSimpleBeep = useCallback(() => {
    generateNotificationBeep(800, 200, 0.3)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [])

  return {
    playNotification,
    playNotificationWithInteraction,
    playDoubleBeep,
    playSimpleBeep,
    initializeAudio
  }
}
