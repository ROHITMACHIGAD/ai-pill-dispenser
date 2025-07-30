import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './VoiceInterface.css'; // Add this at the top with other imports

const VoiceInterface = () => {
  // Core state management
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [stage, setStage] = useState('greeting');
  const [showMenu, setShowMenu] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);

  // Refs for persistent values
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const synth = useRef(window.speechSynthesis);
  const hasGreeted = useRef(false);
  const pillCounts = useRef({ a: 0, b: 0 });
  const [pillDetails, setPillDetails] = useState(null);
  
  // Constants
  const numberWords = {
    // 0-10
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    
    // 11-19
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19,

    // 20-29
    twenty: 20, twentyone: 21, twentytwo: 22, twentythree: 23,
    twentyfour: 24, twentyfive: 25, twentysix: 26, twentyseven: 27,
    twentyeight: 28, twentynine: 29,

    // 30-39
    thirty: 30, thirtyone: 31, thirtytwo: 32, thirtythree: 33,
    thirtyfour: 34, thirtyfive: 35, thirtysix: 36, thirtyseven: 37,
    thirtyeight: 38, thirtynine: 39,

    // 40-49
    forty: 40, fortyone: 41, fortytwo: 42, fortythree: 43,
    fortyfour: 44, fortyfive: 45, fortysix: 46, fortyseven: 47,
    fortyeight: 48, fortynine: 49,

    // 50-59
    fifty: 50, fiftyone: 51, fiftytwo: 52, fiftythree: 53,
    fiftyfour: 54, fiftyfive: 55, fiftysix: 56, fiftyseven: 57,
    fiftyeight: 58, fiftynine: 59,

    // 60
    sixty: 60
};


  // Voice initialization
  useEffect(() => {

    

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoice && voices.length > 0) {
        setSelectedVoice(voices.find(v => v.default) || voices[0]);
      }
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []
  

);

  // Speech functions
  const speak = (text, callback) => {
    if (synth.current) {
      synth.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.onend = callback;
      synth.current.speak(utterance);
    }
  };

  // Initial greeting
  useEffect(() => {
    if (stage === 'greeting' && !hasGreeted.current) {
      hasGreeted.current = true;
      speak(
        "Welcome to Ai pill dispenser , please say a command",
        () => setStage('idle')
      );
    }
  }, [stage]);

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        audioChunks.current = [];
        await processAudio(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      speak("Microphone access required. Please enable permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
      setIsRecording(false);
      if (mediaRecorder.current.stream) {
        mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Audio processing
  const processAudio = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      const { data } = await axios.post('http://localhost:5000/stt', formData);
      setTranscript(data.transcript);
      handleVoiceCommand(data.transcript.toLowerCase());
    } catch (error) {
      console.error('Speech recognition error:', error);
      speak("Could not process audio. Please try again.");
    }
  };

  // Command handling
  const handleVoiceCommand = (text) => {
    switch(stage) {
      case 'idle': handleIdleStage(text); break;
      case 'awaiting_schedule': handleScheduleStage(text); break;
      default: speak("Please try again.");
    }
  };

  const handleIdleStage = (text) => {
    const counts = extractPillCounts(text);
    if (counts) {
      pillCounts.current = counts;
      speak(
        `Got ${counts.a} A pills and ${counts.b} B pills. ` +
        "Now say your schedule like: 'Take A at 8 AM with 2 pills and B at 7 PM with 3 pills'",
        () => setStage('awaiting_schedule')
      );
    } else {
      speak("I need both counts. Example: 'I inserted 2 A pills and 3 B pills'");
    }
  };

  const handleScheduleStage = (text) => {
    const schedule = extractScheduleDetails(text);
    if (schedule) {
      saveMedicationData(schedule);
      speak("Schedule saved successfully!");
      setStage('idle');
    } else {
      speak("Invalid schedule format. Please try again.");
    }
  };

  // Data extraction
  const extractPillCounts = (text) => {
    const pattern = /(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyone|twentytwo|twentythree|twentyfour|twentyfive|twentysix|twentyseven|twentyeight|twentynine|thirty)\s+(?:a|a pills?)\b.*?(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyone|twentytwo|twentythree|twentyfour|twentyfive|twentysix|twentyseven|twentyeight|twentynine|thirty)\s+(?:b|b pills?)\b/i;

    const match = text.match(pattern);
    if (!match) return null;

    const convertNumber = (val) => {
      const numericValue = numberWords[val.toLowerCase()] || parseInt(val, 10);
      return isNaN(numericValue) ? null : numericValue;
    };

    const aCount = convertNumber(match[1]);
    const bCount = convertNumber(match[2]);

    return (aCount !== null && bCount !== null) 
      ? { a: aCount, b: bCount }
      : null;
  };

  const extractScheduleDetails = (text) => {
    const pattern = /(?:i will take|take)\s*(?:pills?|bills?)?\s*a\s+at\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\s*(?:with\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyone|twentytwo|twentythree|twentyfour|twentyfive|twentysix|twentyseven|twentyeight|twentynine|thirty)\s*(?:pills?|bills?)?)?.*?b\s+at\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\s*(?:with\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyone|twentytwo|twentythree|twentyfour|twentyfive|twentysix|twentyseven|twentyeight|twentynine|thirty)\s*(?:pills?|bills?)?)?/i;

    const match = text.match(pattern);
    if (!match) return null;

    const convertQuantity = (val) => {
      if (!val) return 1;
      const num = numberWords[val.toLowerCase()] || parseInt(val, 10);
      return isNaN(num) ? 1 : num;
    };

    return {
      a: {
        time: match[1].replace(/\s/g, ''),
        quantity: convertQuantity(match[2])
      },
      b: {
        time: match[3].replace(/\s/g, ''),
        quantity: convertQuantity(match[4])
      }
    };
  };

  // Data persistence
  const saveMedicationData = async (schedule) => {
    try {
      await axios.post('http://localhost:5000/store', {
        pillA: schedule.a,
        pillB: schedule.b,
        cntA: pillCounts.current.a,
        cntB: pillCounts.current.b
      });
    } catch (error) {
      console.error('Data save error:', error);
      speak("Failed to save data. Please try again.");
    }
  };

  // Menu functionality
  const handleMenuToggle = () => setShowMenu(!showMenu);
  const handleVoiceSelect = (voice) => {
    setSelectedVoice(voice);
    setSelectedMenu(null);
  };
  const handleHealthReportRedirect = () => {
    window.location.href = 'health.html'; // Simple redirect
  };
  
  const handlePillDetailsRedirect = () => {
    window.location.href = 'pill.html';
  };

  const handleinteractRedirect = () => {
    window.location.href = 'interactive.html';
  };

  const renderMenuContent = () => {
    switch(selectedMenu) {
      case 'voices':
        return (
          <div className="submenu">
            <h4>Available Voices</h4>
            {availableVoices.map(voice => (
              <button 
                key={voice.voiceURI}
                className="voice-option"
                onClick={() => handleVoiceSelect(voice)}
              >
                {voice.name} ({voice.lang})
              </button>
            ))}
          </div>
        );
      
        case 'health':
          // Redirect immediately when health menu is selected
          handleHealthReportRedirect();
          return null;
          case 'pills':
            // Redirect immediately when pills menu is selected
            handlePillDetailsRedirect();
            return null;
            case 'interact':
              // Redirect immediately when pills menu is selected
              handleinteractRedirect();
              return null;
      default:
        return (
          <>
            <button className="menu-item" onClick={() => setSelectedMenu('voices')}>
              Change Voice
            </button>
            <button className="menu-item" onClick={() => setSelectedMenu('health')}>
              Health Report
            </button>
            <button className="menu-item" onClick={() => setSelectedMenu('pills')}>
              Pill Details
            </button>
            <button className="menu-item" onClick={() => setSelectedMenu('interact')}>
              Interactive mode
            </button>
          </>
        );
    }
  };

  // Render component
  return (
    <div className="voice-interface">
 
      <div className="hamburger-menu">
        <button className="menu-button" onClick={handleMenuToggle}>
          ☰
        </button>
        
        {showMenu && (
          <div className="menu-content">
            {renderMenuContent()}
            <button 
              className="menu-item"
              onClick={() => setShowMenu(false)}
              style={{ marginTop: '10px' }}
            >
              Close Menu
            </button>
          </div>
        )}
      </div>

      <button 
        onClick={isRecording ? stopRecording : startRecording}
        className={isRecording ? 'recording' : ''}
        disabled={stage === 'greeting'}
      >
        {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
      </button>
      
      <div className="status">
        {transcript && <p className="transcript">You said: {transcript}</p>}
        {stage === 'awaiting_schedule' && (
          <p className="instruction">Waiting for schedule details...</p>
        )}
        {stage === 'greeting' && (
          <p className="welcome">Initializing medication tracker...</p>
        )}
      </div>
    </div>
  );
};

export default VoiceInterface;
