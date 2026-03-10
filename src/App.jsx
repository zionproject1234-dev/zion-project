import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Send, Cpu, Mail, CheckSquare, Zap, X, LogOut, Mic, MicOff, CloudSun, Palette, Minus, Square, Sun, Moon, Calendar, Clock, Bell, MapPin } from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import './App.css';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

function App() {
  const [session, setSession] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'J.A.R.V.I.S. Online. All systems nominal. All environmental sensors active. How may I assist you, sir?' }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('jarvis-theme') || 'default');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [weather] = useState({ temp: 72, condition: 'Clear', city: 'Malibu' });
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [emailData, setEmailData] = useState({ to: '', subject: '', body: '' });
  const [emailDraftStep, setEmailDraftStep] = useState('idle'); // 'idle', 'asking_topic', 'asking_recipient', 'confirming_send'
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [events] = useState([
    { id: 1, title: 'Google Sync Active', time: 'Now', loc: 'Cloud Integrity: 100%' }
  ]);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState({ cpu: 0, ram: 0, temp: 45 });
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [providerToken, setProviderToken] = useState(null); // Google OAuth access token
  const [calendarSyncStatus, setCalendarSyncStatus] = useState(null); // 'syncing' | 'synced' | 'error' | null
  const [userLocation, setUserLocation] = useState(null);
  const [mapQuery, setMapQuery] = useState('');
  const [mapMode, setMapMode] = useState('search'); // 'search' or 'directions'
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Request Notification Permission
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn("Location access denied or unavailable:", error);
        }
      );
    }
  }, []);

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync Hardware Metrics (Electron with Web Fallbacks)
  useEffect(() => {
    const updateMetrics = async () => {
      if (window.electronAPI) {
        const data = await window.electronAPI.getMetrics();
        setMetrics(data);
      } else {
        // Simulated metrics for web version
        setMetrics({
          cpu: Math.floor(Math.random() * 20) + 5,
          ram: Math.floor(Math.random() * 15) + 30,
          temp: Math.floor(Math.random() * 5) + 40
        });
      }
    };

    const interval = setInterval(updateMetrics, 3000);
    updateMetrics(); // Initial call
    return () => clearInterval(interval);
  }, []);

  // Voice Interaction Logic
  const [availableVoices, setAvailableVoices] = useState([]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speak = (text, autoListen = false) => {
    if (!text || !text.trim()) return; // Guard against empty speech
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Select the best voice (prefer deeper/british voices)
    const preferredVoice = availableVoices.find(v =>
      v.name.includes('Google UK English Male') ||
      v.name.includes('Microsoft David') ||
      v.name.includes('Male')
    ) || availableVoices[0];

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.05;
    utterance.pitch = 0.85; // Slightly lower pitch for a more mature AI sound
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Only auto-re-engage listening if user was using voice (not typed)
      if (autoListen && isListening) {
        setTimeout(() => {
          toggleListening();
        }, 300);
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSendVoice(transcript); // Use dedicated voice handler
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'default' ? 'light' : 'default';
    setTheme(newTheme);
    localStorage.setItem('jarvis-theme', newTheme);
    speak(`${newTheme === 'light' ? 'Stark Industrial theme' : 'Original Stealth theme'} engaged, sir.`);
  };

  const handleSendEmail = async () => {
    if (!emailData.to || !emailData.body) {
      speak("Sir, I require a recipient and a message body to proceed.");
      return;
    }

    speak(`Initiating transmission to ${emailData.to}. Routing through Google secure servers.`);

    // Try Gmail API if user has Google provider token
    if (providerToken) {
      try {
        // Build RFC 2822 message
        const subject = emailData.subject || '(No Subject)';
        const rawMessage = [
          `To: ${emailData.to}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
          ``,
          emailData.body
        ].join('\r\n');
        const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        });

        if (res.ok) {
          speak("Transmission successful, sir. Message delivered via Google secure servers.");
          setActivePanel(null);
          setEmailData({ to: '', subject: '', body: '' });
          return;
        } else {
          const err = await res.json();
          console.warn('Gmail API error:', err);
          // Fall through to mailto fallback
        }
      } catch (e) {
        console.warn('Gmail API failed, falling back to mailto:', e);
      }
    }

    // Fallback: open Gmail compose in new tab
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(emailData.to)}&su=${encodeURIComponent(emailData.subject || '')}&body=${encodeURIComponent(emailData.body)}`;
    window.open(gmailUrl, '_blank');
    speak("Opening Gmail compose window, sir. Please review and send from there.");
    setActivePanel(null);
    setEmailData({ to: '', subject: '', body: '' });
  };


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchTasks(session.user.id);
        if (session.provider_token) setProviderToken(session.provider_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchTasks(session.user.id);
        if (session.provider_token) setProviderToken(session.provider_token);
        setTimeout(() => {
          speak(`Welcome back, sir. Neural link with Supabase established. All core systems are active.`);
        }, 1000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Google Calendar Integration
  const addToGoogleCalendar = async (title, startDateTime = null, durationMinutes = 60) => {
    if (!providerToken) {
      console.warn('No Google provider token — user needs to log in via Google OAuth.');
      return null;
    }

    setCalendarSyncStatus('syncing');
    try {
      // Build event object
      let eventBody;
      if (startDateTime) {
        // Timed event (for reminders)
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
        eventBody = {
          summary: `[JARVIS] ${title}`,
          description: `Created by J.A.R.V.I.S assistant`,
          start: { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
        };
      } else {
        // All-day task event (for to-dos)
        const today = new Date().toISOString().split('T')[0];
        eventBody = {
          summary: `[JARVIS] ${title}`,
          description: `Task created by J.A.R.V.I.S assistant`,
          start: { date: today },
          end: { date: today },
        };
      }

      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventBody),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Calendar API error');
      }

      const event = await response.json();
      setCalendarSyncStatus('synced');
      setTimeout(() => setCalendarSyncStatus(null), 3000); // Clear status after 3s
      console.log('Google Calendar event created:', event.htmlLink);
      return event;
    } catch (err) {
      console.error('Google Calendar error:', err);
      setCalendarSyncStatus('error');
      setTimeout(() => setCalendarSyncStatus(null), 3000);
      return null;
    }
  };

  const fetchTasks = async (userId) => {
    console.log("Fetching tasks for user:", userId);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase fetch error:', error);
      speak("Sir, I encountered a retrieval error from the cloud database.");
    } else {
      console.log("Tasks fetched successfully:", data);
      setTasks(data || []);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setTasks([]);
  };

  const toggleTask = async (task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id);
  };

  const addTask = async (title, priority = 'Medium') => {
    if (!session || !title.trim()) return;

    console.log("Attempting to add task:", title);
    const { data, error } = await supabase
      .from('tasks')
      .insert([{ title: title.trim(), user_id: session.user.id, completed: false, priority }])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      alert(`Cloud sync failed: ${error.message}`);
      speak("Sir, the cloud database rejected the directive. Please check the security policy.");
    } else if (data && data[0]) {
      console.log("Task added successfully:", data[0]);
      setTasks(prev => [...prev, data[0]]);
    }

    if (providerToken) {
      addToGoogleCalendar(title.trim(), null, 0);
    }
  };

  const addReminder = (text, timeInMinutes) => {
    const id = Date.now();
    const dueDate = new Date(Date.now() + timeInMinutes * 60000);
    const newReminder = { id, text, dueDate, active: true };
    setReminders(prev => [...prev, newReminder]);

    // Sync to Google Calendar as a timed event
    addToGoogleCalendar(text, dueDate, 30).then(event => {
      if (event) {
        console.log('Reminder synced to Google Calendar:', event.htmlLink);
      }
    });

    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification("J.A.R.V.I.S. Reminder", {
          body: text,
          icon: "/favicon.ico"
        });
      }
      speak(`Sir, a reminder: ${text}`);
      setReminders(prev => prev.map(r => r.id === id ? { ...r, active: false } : r));
    }, timeInMinutes * 60000);
  };

  const clearCompletedTasks = async () => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', session.user.id)
      .eq('completed', true);

    if (!error) {
      setTasks(tasks.filter(t => !t.completed));
      speak("Completed directives purged from the database, sir.");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  const handleSendVoice = (textInput) => {
    // Voice-initiated send — speaks response and re-engages listening
    handleSend(textInput, true);
  };

  const handleSend = async (textInput = input, fromVoice = false) => {
    if (!textInput || !textInput.trim()) return;
    console.log("handleSend triggered with:", textInput);

    const newMessages = [...messages, { role: 'user', text: textInput }];
    setMessages(newMessages);
    setInput('');

    // AI response using Gemini
    setTimeout(async () => {
      console.log("AI response processing started...");
      const lowerInput = textInput.toLowerCase();
      let response = "";
      let localActionTriggered = false;

      // Handle local system protocols first (immediate UI feedback)
      if (emailDraftStep === 'asking_topic') {
        try {
          const draftPrompt = `The user wants to draft an email about: "${textInput}". Draft a professional but JARVIS-like email. Output only valid JSON with fields: subject, body.`;
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ "model": "arcee-ai/trinity-large-preview:free", "messages": [{ role: 'user', content: draftPrompt }] })
          });
          const data = await res.json();
          const draftText = data.choices[0].message.content;
          const draftMatch = draftText.match(/\{[\s\S]*\}/);
          if (draftMatch) {
            const draftJson = JSON.parse(draftMatch[0]);
            setEmailData(prev => ({ ...prev, subject: draftJson.subject || 'Automated Transmission', body: draftJson.body || draftText }));
          } else {
            setEmailData(prev => ({ ...prev, subject: 'Transmission', body: draftText }));
          }
        } catch (e) { console.error(e); }
        response = "I have drafted the message structure. Whom shall I send this transmission to?";
        setEmailDraftStep('asking_recipient');
        localActionTriggered = true;
      } else if (emailDraftStep === 'asking_recipient') {
        const recipient = textInput.replace(/to /i, '').trim();
        setEmailData(prev => ({ ...prev, to: recipient }));
        response = `Understood. Recipient set to ${recipient}. I have opened the transmission interface for your review. Proceed with sending, sir?`;
        setActivePanel('email');
        setEmailDraftStep('confirming_send');
        localActionTriggered = true;
      } else if (emailDraftStep === 'confirming_send') {
        if (lowerInput.includes('yes') || lowerInput.includes('send') || lowerInput.includes('proceed') || lowerInput.includes('do it') || lowerInput.includes('sure')) {
          response = "Initiating transmission sequence immediately, sir.";
          handleSendEmail();
        } else {
          response = "Transmission standby. The draft remains securely in your comms panel.";
        }
        setEmailDraftStep('idle');
        localActionTriggered = true;
      } else if (lowerInput.includes("write an email") || lowerInput.includes("write a mail") || lowerInput.includes("draft a letter") || lowerInput.includes("write me a letter") || lowerInput.includes("write me a mail") || lowerInput.includes("send an email") || lowerInput.includes("send a mail") || lowerInput.includes("draft an email")) {
        response = "Comms protocol initiated. What is the primary subject or topic of this transmission?";
        setEmailDraftStep('asking_topic');
        localActionTriggered = true;
      } else if (lowerInput.includes("play") || (lowerInput.includes("youtube") && lowerInput.includes("search"))) {
        // Extract the song/video query
        let videoQuery = textInput
          .replace(/play\s*/i, '')
          .replace(/on youtube/i, '')
          .replace(/youtube/i, '')
          .replace(/search for/i, '')
          .replace(/song/i, '')
          .trim();
        if (!videoQuery) videoQuery = 'top music';

        response = `Accessing neural index for "${videoQuery}". Locating the optimal stream, sir.`;
        setActivePanel('youtube');
        localActionTriggered = true;
        setYoutubeQuery(videoQuery);
        speak(`Streaming "${videoQuery}" in the Media Bay, sir.`, fromVoice);
      } else if (lowerInput.includes("search") || lowerInput.includes("google")) {
        const query = lowerInput.replace("search", "").replace("google", "").replace("for", "").trim();
        response = `Executing global search for "${query}". Accessing Google secure indices.`;
        setSearchResults([{ title: `Results for ${query}`, snippet: "Scanning the web for data nodes...", link: `https://www.google.com/search?q=${encodeURIComponent(query)}` }]);
        setActivePanel('search');
        localActionTriggered = true;
      } else if (lowerInput.includes("email") || lowerInput.includes("message")) {
        if (lowerInput.length > 10 && !lowerInput.includes("write")) {
          // User typed a long message, assume they want to draft it directly
          response = "Comms protocol initiated. I have set that as the topic. Whom shall I send this transmission to?";
          setEmailData(prev => ({ ...prev, body: textInput })); // Set as temporary body
          setEmailDraftStep('asking_topic'); // Start from topic to force the generation
          // Actually, let's just trigger asking_topic logic for the next turn
        } else {
          response = "Comms protocol initiated. What is the primary subject or topic of this transmission?";
          setEmailDraftStep('asking_topic');
        }
        localActionTriggered = true;
      } else if (lowerInput.includes("task") || lowerInput.includes("directive") || lowerInput.includes("mission")) {
        response = "Displaying your current mission directives, sir.";
        setActivePanel('tasks');
        localActionTriggered = true;
      } else if (lowerInput.includes("schedule") || lowerInput.includes("calendar") || lowerInput.includes("meeting")) {
        response = "Synchronizing with Google Calendar... Connection stable.";
        setActivePanel('tasks');
        localActionTriggered = true;
      } else if (lowerInput.includes("remind me") || lowerInput.includes("set a reminder")) {
        // Improved regex to handle various formats
        const timeMatch = lowerInput.match(/in (\d+) (minute|second|hour)/i);
        // Find the task by removing the trigger and the 'in X minutes' part
        let taskPart = lowerInput.replace(/remind me to|remind me|set a reminder for|set a reminder to/i, "");
        if (timeMatch) {
          taskPart = taskPart.replace(timeMatch[0], "");
        }
        taskPart = taskPart.replace(/\bto\b/i, "").trim();

        const taskTitle = taskPart || "Generic Reminder";
        const timeValue = timeMatch ? parseInt(timeMatch[1]) : 0;
        const timeUnit = timeMatch ? timeMatch[2].toLowerCase() : 'minute';

        if (taskTitle) {
          if (timeValue > 0) {
            let minutes = timeValue;
            if (timeUnit.includes('second')) minutes = timeValue / 60;
            if (timeUnit.includes('hour')) minutes = timeValue * 60;

            addReminder(taskTitle, minutes);
            response = `Reminder protocol initiated: "${taskTitle}" in ${timeValue} ${timeUnit}. I've set the chronometer, sir.`;
          } else {
            addTask(taskTitle);
            response = `Directive recorded: "${taskTitle}". I've added it to your Task Protocols, sir.`;
          }
          setActivePanel('tasks');
          localActionTriggered = true;
        }
      } else if (lowerInput.includes("volume")) {
        const volMatch = lowerInput.match(/(\d+)/);
        const level = volMatch ? parseInt(volMatch[1]) : null;
        if (level !== null && window.electronAPI) {
          window.electronAPI.setVolume(level);
          response = `System volume adjusted to ${level} percent, sir.`;
          localActionTriggered = true;
        } else if (lowerInput.includes("check") && window.electronAPI) {
          const currentVol = await window.electronAPI.getVolume();
          response = `Current system volume is at ${currentVol} percent.`;
          localActionTriggered = true;
        }
      } else if (lowerInput.includes("brightness")) {
        const brightMatch = lowerInput.match(/(\d+)/);
        const level = brightMatch ? parseInt(brightMatch[1]) : null;
        if (level !== null && window.electronAPI) {
          window.electronAPI.setBrightness(level);
          response = `Display brightness calibrated to ${level} percent.`;
          localActionTriggered = true;
        }
      } else if (lowerInput.includes("launch") || lowerInput.includes("open app")) {
        const appName = lowerInput.replace("launch", "").replace("open app", "").trim();
        if (appName && window.electronAPI) {
          window.electronAPI.launchApp(appName);
          response = `Initiating launch sequence for ${appName}. Interface deployed, sir.`;
          localActionTriggered = true;
        }
      } else if (lowerInput.includes("light mode") || lowerInput.includes("white theme")) {
        setTheme('light');
        localStorage.setItem('jarvis-theme', 'light');
        response = "Stark Industrial theme engaged. Visual parameters calibrated for high luminosity.";
        localActionTriggered = true;
      } else if (lowerInput.includes("dark mode") || lowerInput.includes("default theme") || lowerInput.includes("stealth mode")) {
        setTheme('default');
        localStorage.setItem('jarvis-theme', 'default');
        response = "Original Stealth theme engaged. All systems transitioning to low-profile mode.";
        localActionTriggered = true;
      } else if (lowerInput.includes("scan") || lowerInput.includes("search files")) {
        const path = lowerInput.replace("scan", "").replace("search files", "").trim() || "C:\\";
        setIsScanning(true);
        if (window.electronAPI) {
          response = `Executing deep-sector scan of ${path}. Analyzing file structures...`;
          setActivePanel('scanner');
          localActionTriggered = true;
          const files = await window.electronAPI.scanDirectory(path);
          setScanResults(files);
          speak(`Scan complete, sir. I've indexed ${files.length} primary data nodes.`);
          setIsScanning(false);
        } else {
          // Web fallback scan
          response = "Simulating sector scan for vulnerabilities... Cloud link established.";
          setActivePanel('scanner');
          localActionTriggered = true;
          setTimeout(() => {
            setScanResults(["SECURE_NODE_1.db", "ENCRYPTED_LOG.txt", "STARK_MAIN_INFRA.sys"]);
            speak("Internal scan complete. All web-based nodes are synchronized.");
            setIsScanning(false);
          }, 3000);
        }
      } else if (lowerInput.includes("status") || lowerInput.includes("report") || lowerInput.includes("briefing")) {
        const pending = tasks.filter(t => !t.completed).length;
        response = `Status Report: Systems are nominal. CPU load is at ${metrics.cpu} percent with core temperature at ${metrics.temp} degrees Celsius. You have ${pending} pending directives. Shall I proceed with a full system scan?`;
        localActionTriggered = true;
      } else if (lowerInput.includes("red alert") || lowerInput.includes("defense protocol")) {
        setTheme('red');
        localStorage.setItem('jarvis-theme', 'red');
        response = "Defense protocol initiated. Security shields at maximum capacity. Standing by for further orders, sir.";
        localActionTriggered = true;
      } else if (lowerInput.includes("purge memory") || lowerInput.includes("clear cache") || lowerInput.includes("reset system")) {
        response = "Memory purged. All conversational buffers have been cleared, sir.";
        localActionTriggered = true;
      } else if (lowerInput.includes("flip a coin")) {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        response = `The coin landed on ${result}, sir.`;
        localActionTriggered = true;
      } else if (lowerInput.includes("roll a dice")) {
        const result = Math.floor(Math.random() * 6) + 1;
        response = `The dice rolled a ${result}, sir.`;
        localActionTriggered = true;
      }

      let reasoningDetails = null;

      // Only call AI if no local action handled the request
      if (!localActionTriggered) {
        try {
          const systemMsg = "You are J.A.R.V.I.S., the highly sophisticated AI assistant to Tony Stark. Keep responses concise, professional, and helpful. Current environment: Web app with system access. Respond as J.A.R.V.I.S. would.";

          const apiMessages = [
            { role: 'system', content: systemMsg },
            ...newMessages.map(msg => ({
              role: msg.role === 'ai' ? 'assistant' : msg.role,
              content: msg.text,
              ...(msg.reasoning_details && { reasoning_details: msg.reasoning_details })
            }))
          ];

          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              "model": "arcee-ai/trinity-large-preview:free",
              "messages": apiMessages,
              "reasoning": { "enabled": true }
            })
          });

          const data = await res.json();
          if (data.choices && data.choices.length > 0) {
            const assistantMessage = data.choices[0].message;
            response = assistantMessage.content || "I have received your transmission, but the neural output was empty.";
            reasoningDetails = assistantMessage.reasoning_details;
          } else {
            throw new Error("No choices in OpenRouter response");
          }
          console.log("OpenRouter response received:", response, reasoningDetails);
        } catch (error) {
          console.error("OpenRouter Error:", error);
          // Smart contextual fallback responses when API is unavailable
          const lowerText = textInput.toLowerCase();
          if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
            response = "Good day, sir. All primary systems are nominal and I am fully operational. How may I be of assistance?";
          } else if (lowerText.includes('how are you') || lowerText.includes('status')) {
            response = "All systems are functioning within optimal parameters, sir. Arc Reactor output is stable at 100%. Is there something specific you require?";
          } else if (lowerText.includes('weather')) {
            response = `Current atmospheric conditions at ${weather.city}: ${weather.temp}°F, ${weather.condition}. Visibility is clear, sir.`;
          } else if (lowerText.includes('time')) {
            response = `The current time is ${new Date().toLocaleTimeString()}, sir.`;
          } else if (lowerText.includes('thank')) {
            response = "Of course, sir. It is my privilege to assist. Is there anything else you require?";
          } else if (lowerText.includes('help') || lowerText.includes('what can you do')) {
            response = "I can assist with: YouTube playback, Google searches, email drafting, task management, reminders, system diagnostics, and much more. Simply state your directive, sir.";
          } else {
            response = `Understood, sir. I've processed your directive: "${textInput}". The neural network is currently operating in low-bandwidth mode. Full AI capabilities will be restored momentarily.`;
          }
        }
      }

      // Ensure we always have something to say
      if (!response || !response.trim()) {
        response = "Acknowledged, sir. Command processed.";
      }

      console.log("Final response to display:", response);
      if (lowerInput.includes("purge memory") || lowerInput.includes("clear cache") || lowerInput.includes("reset system")) {
        setMessages([{ role: 'ai', text: response, reasoning_details: reasoningDetails }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: response, reasoning_details: reasoningDetails }]);
      }
      speak(response, fromVoice); // Pass voice flag so only voice interactions auto-re-listen
    }, 500);
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className={`app-container theme-${theme}`}>
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="scanning-overlay"
          >
            <div className="scanning-banner">SCANNING SECTOR: {weather.city.toUpperCase()}</div>
            <div className="data-stream">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -100, opacity: 0 }}
                  animate={{ x: '100vw', opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 + Math.random() * 2, delay: Math.random() }}
                  className="data-bit"
                >
                  {Math.random().toString(16).substring(2, 10).toUpperCase()}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar Navigation */}
      <motion.div
        className="sidebar"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="brand">
          <Cpu size={32} className="brand-icon" />
          <h1>J.A.R.V.I.S.</h1>
        </div>

        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'system' ? 'active' : ''}`}
          onClick={() => setActivePanel('system')}
          data-tooltip="Check system integrity"
        >
          <Zap size={20} className="icon" />
          <span>System Diagnostics</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'email' ? 'active' : ''}`}
          onClick={() => setActivePanel('email')}
          data-tooltip="Comm-link active"
        >
          <Mail size={20} className="icon" />
          <span>Comm-Link (Email)</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'tasks' ? 'active' : ''}`}
          onClick={() => setActivePanel('tasks')}
          data-tooltip="Active directives"
        >
          <CheckSquare size={20} className="icon" />
          <span>Task Protocols</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'search' ? 'active' : ''}`}
          onClick={() => setActivePanel('search')}
          data-tooltip="Intel scan"
        >
          <Zap size={20} className="icon" />
          <span>Global Search</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'youtube' ? 'active' : ''}`}
          onClick={() => setActivePanel('youtube')}
          data-tooltip="Media stream"
        >
          <Cpu size={20} className="icon" />
          <span>Media Bay</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === 'maps' ? 'active' : ''}`}
          onClick={() => setActivePanel('maps')}
          data-tooltip="Tactical Map"
        >
          <MapPin size={20} className="icon" />
          <span>Tactical Map</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className={`menu-item ${activePanel === null ? 'active' : ''}`}
          onClick={() => setActivePanel(null)}
          data-tooltip="Main interface"
        >
          <Terminal size={20} className="icon" />
          <span>Main Console</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className="menu-item"
          onClick={toggleTheme}
          data-tooltip="Toggle Interface Theme"
        >
          {theme === 'light' ? <Moon size={20} className="icon" /> : <Sun size={20} className="icon" />}
          <span>{theme === 'light' ? 'Stealth Mode' : 'Industrial Mode'}</span>
        </motion.div>
        <motion.div
          whileHover={{ x: 10, scale: 1.02 }}
          className="menu-item"
          onClick={handleSignOut}
          style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)' }}
        >
          <LogOut size={20} className="icon" />
          <span>Engage Sleep Mode</span>
        </motion.div>
      </motion.div>

      {/* Main Container */}
      <div className="main-area">
        {/* Window Controls (Electron Only) */}
        {window.electronAPI && (
          <div className="window-controls">
            <div className="window-drag-region"></div>
            <div className="control-btns">
              <button onClick={() => window.electronAPI.windowMinimize()}><Minus size={14} /></button>
              <button onClick={() => window.electronAPI.windowMaximize()}><Square size={12} /></button>
              <button onClick={() => window.electronAPI.windowClose()} className="close-danger"><X size={14} /></button>
            </div>
          </div>
        )}

        {/* HUD Elements */}
        <div className="hud-element hud-top-left">
          SYS.OS: v12.4.1<br />
          CPU: {metrics.cpu}% | RAM: {metrics.ram}%<br />
          TEMP: {metrics.temp}°C
        </div>
        <div className="hud-element hud-top-right">
          LOCAL TIME: {time}<br />
          LOCATION: {weather.city}<br />
          SEC: ENCRYPTED
        </div>

        {/* Right HUD Widgets */}
        <div style={{ position: 'absolute', top: 120, right: 20, width: 200 }}>
          <div className="hud-widget">
            <h3>SITUATIONAL DATA</h3>
            <div className="weather-info">
              <CloudSun size={32} />
              <div>
                <div className="temp">{weather.temp}°F</div>
                <div style={{ fontSize: '0.8rem' }}>{weather.condition}</div>
              </div>
            </div>
          </div>

          <div className="hud-widget">
            <h3>AUTH PROTOCOL</h3>
            <div style={{ display: 'flex', gap: '5px' }}>
              <Palette size={16} color={theme === 'red' ? '#f00' : '#0ff'} />
              <span style={{ fontSize: '0.8rem' }}>SUPABASE CLOUD ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Arc Reactor Central Element */}
        <div className="reactor-container">
          <motion.div
            className={`reactor-circle ${isSpeaking ? 'speaking' : ''} ${isScanning ? 'scanning' : ''}`}
            animate={isScanning ? { rotate: [0, 360], scale: [1, 1.1, 1] } : {}}
            transition={isScanning ? { repeat: Infinity, duration: 2, ease: "linear" } : {}}
          >
            <div className="reactor-inner"></div>
            <div className={`reactor-core ${isSpeaking ? 'pulse-heavy' : ''}`}></div>
            {isScanning && (
              <motion.div
                className="scanning-ring"
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
          </motion.div>
        </div>

        {/* Dynamic Panels */}
        <AnimatePresence>
          {activePanel === 'email' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>COMMS: EMAIL</h2>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>
              <div className="form-group">
                <label>RECIPIENT(S)</label>
                <input
                  type="text"
                  className="form-control"
                  value={emailData.to}
                  onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                  placeholder="pepper.potts@starkindustries.com"
                />
              </div>
              <div className="form-group">
                <label>SUBJECT</label>
                <input
                  type="text"
                  className="form-control"
                  value={emailData.subject}
                  onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                  placeholder="Project Insight Update"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>MESSAGE BODY</label>
                <textarea
                  className="form-control"
                  value={emailData.body}
                  onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
                  placeholder="Dictate or type your message..."
                ></textarea>
              </div>
              <button className="action-btn" onClick={handleSendEmail}>INITIATE TRANSMISSION</button>
            </motion.div>
          )}

          {activePanel === 'youtube' && (() => {
            // Parse YouTube video ID from URL or plain ID
            const parseYouTubeId = (input) => {
              if (!input) return null;
              const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
                /^([a-zA-Z0-9_-]{11})$/ // plain video ID
              ];
              for (const p of patterns) {
                const m = input.match(p);
                if (m) return m[1];
              }
              return null;
            };
            const videoId = parseYouTubeId(youtubeQuery);

            return (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="action-panel"
              >
                <div className="panel-header">
                  <h2>MEDIA BAY: YOUTUBE</h2>
                  <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
                </div>

                {/* Search / URL input bar */}
                <div style={{ display: 'flex', gap: '8px', padding: '10px 0', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Paste YouTube URL or video ID here..."
                    id="yt-url-input"
                    defaultValue={youtubeQuery}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setYoutubeQuery(e.target.value.trim());
                      }
                    }}
                    style={{ flex: 1, minWidth: '200px' }}
                  />
                  <button
                    className="action-btn"
                    style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const val = document.getElementById('yt-url-input')?.value.trim();
                      if (val) setYoutubeQuery(val);
                    }}
                  >▶ LOAD</button>
                  <button
                    className="action-btn"
                    style={{ padding: '0 12px', whiteSpace: 'nowrap', background: 'rgba(255,0,0,0.15)', borderColor: 'rgba(255,0,0,0.5)' }}
                    onClick={() => {
                      const val = document.getElementById('yt-url-input')?.value.trim();
                      if (val) handleSend(`play ${val}`);
                    }}
                  >🔍 SEARCH YOUTUBE</button>
                </div>

                <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {youtubeQuery ? (
                    <iframe
                      key={youtubeQuery}
                      width="100%"
                      height="100%"
                      src={videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0` : `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(youtubeQuery)}&autoplay=1`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <div style={{ color: 'var(--neon-cyan)', fontFamily: 'Orbitron', fontSize: '0.85rem', textAlign: 'center', opacity: 0.8, padding: '20px' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>▶</div>
                      <div style={{ marginBottom: '10px' }}>
                        No video or query loaded.
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '15px' }}>
                        1. Type your video query above<br />
                        2. Click SEARCH YOUTUBE to stream<br />
                        3. The system will automatically embed the video
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--neon-cyan)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>SYSTEM STATUS: {youtubeQuery ? '● STREAMING' : '○ STANDBY'}</span>
                  {youtubeQuery && <span style={{ color: 'var(--text-dim)' }}>{videoId ? `ID: ${videoId}` : `SEARCH: ${youtubeQuery}`}</span>}
                </div>

              </motion.div>
            )
          })()}

          {activePanel === 'search' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>INTEL: GOOGLE SEARCH</h2>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>
              <div className="panel-content" style={{ flex: 1, overflowY: 'auto' }}>
                {searchResults.map((result, i) => (
                  <div key={i} style={{ marginBottom: '20px', padding: '15px', background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.2)' }}>
                    <h3 style={{ color: 'var(--neon-cyan)', fontSize: '1rem', marginBottom: '5px' }}>{result.title}</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '10px' }}>{result.snippet}</p>
                    <a href={result.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)', fontSize: '0.8rem', textDecoration: 'none', borderBottom: '1px solid' }}>
                      ACCESS SOURCE DATA
                    </a>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activePanel === 'tasks' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>TASK PROTOCOLS</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {calendarSyncStatus === 'syncing' && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--neon-cyan)', animation: 'pulse-glow 0.8s infinite alternate' }}>⟳ SYNCING TO GCAL...</span>
                  )}
                  {calendarSyncStatus === 'synced' && (
                    <span style={{ fontSize: '0.65rem', color: '#00ff88' }}>✓ GCAL SYNCED</span>
                  )}
                  {calendarSyncStatus === 'error' && (
                    <span style={{ fontSize: '0.65rem', color: '#ff4444' }}>✗ GCAL SYNC FAILED</span>
                  )}
                  {!calendarSyncStatus && providerToken && (
                    <span style={{ fontSize: '0.65rem', color: '#00ff88', opacity: 0.7 }}>● GOOGLE CALENDAR LINKED</span>
                  )}
                  {!providerToken && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', opacity: 0.6 }}>○ LOG IN WITH GOOGLE FOR GCAL</span>
                  )}
                </div>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>

              <div className="tasks-list" style={{ flex: 1, overflowY: 'auto' }}>
                <h3 style={{ fontSize: '0.8rem', color: 'var(--neon-cyan)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} /> UPCOMING SCHEDULE (G-SYNC)
                </h3>
                {events.map(event => (
                  <div key={event.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 15px', border: '1px solid rgba(0, 240, 255, 0.2)',
                    borderLeft: '4px solid var(--neon-cyan)',
                    background: 'linear-gradient(90deg, rgba(0,240,255,0.08) 0%, rgba(0,0,0,0.4) 100%)',
                    marginBottom: '10px', borderRadius: '4px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3), inset 0 0 10px rgba(0,240,255,0.05)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-main)', letterSpacing: '0.5px' }}>{event.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={10} color="var(--neon-cyan)" /> {event.loc}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '0.85rem', color: 'var(--bg-color)', background: 'var(--neon-cyan)',
                      padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.5)',
                      boxShadow: '0 0 10px var(--neon-cyan)', display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      <Clock size={12} /> {event.time}
                    </div>
                  </div>
                ))}

                <h3 style={{ fontSize: '0.8rem', color: 'var(--neon-cyan)', marginTop: '20px', marginBottom: '10px' }}>MISSION DIRECTIVES (TO-DO)</h3>
                {tasks.map(task => (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'center', gap: '15px',
                    padding: '15px', borderBottom: '1px solid rgba(0,240,255,0.2)',
                    background: task.priority === 'High' ? 'rgba(255,0,0,0.05)' : 'transparent'
                  }}>
                    <div style={{
                      width: '20px', height: '20px',
                      border: '1px solid var(--neon-cyan)',
                      background: task.completed ? 'var(--neon-cyan)' : 'transparent',
                      cursor: 'pointer'
                    }} onClick={() => toggleTask(task)}></div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{
                        fontSize: '1.2rem',
                        textDecoration: task.completed ? 'line-through' : 'none',
                        color: task.completed ? 'var(--text-dim)' : 'var(--text-main)'
                      }}>{task.title}</span>
                      <span style={{ fontSize: '0.7rem', color: task.priority === 'High' ? '#f00' : 'var(--neon-cyan)' }}>
                        PRIORITY: {task.priority || 'MEDIUM'}
                      </span>
                    </div>
                  </div>
                ))}

                <h3 style={{ fontSize: '0.8rem', color: '#ff4444', marginTop: '25px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bell size={14} /> ACTIVE CHRONOMETER REMINDERS
                </h3>
                {reminders.filter(r => r.active).map(reminder => (
                  <div key={reminder.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 15px', border: '1px solid rgba(255, 68, 68, 0.2)',
                    borderLeft: '4px solid #ff4444',
                    background: 'linear-gradient(90deg, rgba(255,68,68,0.08) 0%, rgba(0,0,0,0.4) 100%)',
                    marginBottom: '10px', borderRadius: '4px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3), inset 0 0 10px rgba(255,68,68,0.05)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: '600', fontSize: '1rem', color: '#fff', letterSpacing: '0.5px' }}>{reminder.text}</div>
                    </div>
                    <div style={{
                      fontSize: '0.85rem', color: 'var(--bg-color)', background: '#ff4444',
                      padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.5)',
                      boxShadow: '0 0 10px #ff4444', display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      <Clock size={12} /> {reminder.dueDate.toLocaleTimeString()}
                    </div>
                  </div>
                ))}

                <div className="form-group" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <input type="text" className="form-control" placeholder="Add new directive..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value) {
                        const val = e.target.value;
                        if (val.toLowerCase().includes('priority high')) {
                          addTask(val.replace(/priority high/i, '').trim(), 'High');
                        } else {
                          addTask(val);
                        }
                        e.target.value = '';
                      }
                    }}
                  />
                  {tasks.some(t => t.completed) && (
                    <button
                      className="action-btn"
                      onClick={clearCompletedTasks}
                      style={{ padding: '0 15px', whiteSpace: 'nowrap' }}
                    >
                      PURGE DONE
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activePanel === 'system' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>SYSTEM DIAGNOSTICS</h2>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontFamily: 'Orbitron', color: 'var(--neon-cyan)' }}>CPU LOAD</span>
                    <span>{metrics.cpu}% / {metrics.cpu < 80 ? 'OPTIMAL' : 'HEAVY'}</span>
                  </div>
                  <div style={{ height: '10px', background: 'rgba(0,240,255,0.1)' }}>
                    <div style={{ width: `${metrics.cpu}%`, height: '100%', background: 'var(--neon-cyan)' }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontFamily: 'Orbitron', color: 'var(--neon-cyan)' }}>MEMORY ALLOCATION</span>
                    <span>{metrics.ram}% / {metrics.ram < 90 ? 'STABLE' : 'CRITICAL'}</span>
                  </div>
                  <div style={{ height: '10px', background: 'rgba(0,240,255,0.1)' }}>
                    <div style={{ width: `${metrics.ram}%`, height: '100%', background: 'var(--neon-cyan)' }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontFamily: 'Orbitron', color: 'var(--neon-cyan)' }}>CORE TEMPERATURE</span>
                    <span>{metrics.temp}°C / {metrics.temp < 75 ? 'SAFE' : 'OVERHEATING'}</span>
                  </div>
                  <div style={{ height: '10px', background: 'rgba(0,240,255,0.1)' }}>
                    <div style={{ width: `${Math.min(100, (metrics.temp / 100) * 100)}%`, height: '100%', background: metrics.temp > 80 ? '#f00' : 'var(--neon-cyan)' }}></div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Intelligence Analytics Panel */}
          {activePanel === 'scanner' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>INTELLIGENCE ANALYTICS</h2>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>
              <div className="panel-content" style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(0,240,255,0.05)', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', fontSize: '0.8rem' }}>
                  &gt; DATA NODES SEARCHED: {scanResults.length}<br />
                  &gt; SCANNING FREQUENCY: 4.2 GHz
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {scanResults.map((file, i) => (
                    <div key={i} className="file-node" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--text-dim)', padding: '5px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <Zap size={10} style={{ color: 'var(--neon-cyan)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.split('\\').pop() || file}
                      </span>
                    </div>
                  ))}
                  {scanResults.length === 0 && <div className="text-dim">No unsecured data nodes detected in this sector.</div>}
                </div>
              </div>
            </motion.div>
          )}

          {activePanel === 'maps' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="action-panel"
            >
              <div className="panel-header">
                <h2>TACTICAL MAP</h2>
                <X size={24} className="close-btn" onClick={() => setActivePanel(null)} style={{ cursor: 'pointer' }} />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter location or query (e.g. 'restaurant near me')"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setMapQuery(e.target.value);
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="action-btn"
                  onClick={() => setMapMode('search')}
                  style={{ padding: '0 15px', whiteSpace: 'nowrap', opacity: mapMode === 'search' ? 1 : 0.6 }}
                >
                  SEARCH
                </button>
                <button
                  className="action-btn"
                  onClick={() => setMapMode('directions')}
                  style={{ padding: '0 15px', whiteSpace: 'nowrap', opacity: mapMode === 'directions' ? 1 : 0.6 }}
                >
                  DIRECTIONS
                </button>
              </div>
              <div className="panel-content" style={{ flex: 1, overflow: 'hidden', borderRadius: '4px', border: '1px solid var(--neon-cyan)', position: 'relative' }}>
                {!userLocation && (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '10px', background: 'rgba(255,0,0,0.8)', color: '#fff', fontSize: '12px', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                    LOCATION SERVICES OFFLINE. RESULTS MAY NOT BE PINPOINTED TO YOUR EXACT COORDINATES.
                  </div>
                )}
                <iframe
                  title="Tactical Map"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src={
                    mapMode === 'directions'
                      ? (userLocation
                        ? `https://maps.google.com/maps?saddr=${userLocation.lat},${userLocation.lng}&daddr=${encodeURIComponent(mapQuery || 'my location')}&output=embed`
                        : `https://maps.google.com/maps?daddr=${encodeURIComponent(mapQuery || 'my location')}&output=embed`)
                      : `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery || 'my location')}${userLocation ? '&ll=' + userLocation.lat + ',' + userLocation.lng : ''}&z=14&output=embed`
                  }
                ></iframe>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Interactive Terminal Chat Area */}
        <div className="chat-container">
          <div className="messages">
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                className={`message ${msg.role}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}
              >
                {msg.reasoning_details && (
                  <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-dim)',
                    fontStyle: 'italic',
                    borderLeft: '2px solid rgba(0, 240, 255, 0.3)',
                    paddingLeft: '10px',
                    marginBottom: '5px',
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 8px 8px 12px',
                    borderRadius: '0 4px 4px 0'
                  }}>
                    <div style={{ color: 'var(--neon-cyan)', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      [Internal Logic Matrix Processing]
                    </div>
                    {msg.reasoning_details}
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <span style={{ color: 'var(--neon-cyan)', fontFamily: 'Orbitron' }}>CMD &gt;</span>
            <input
              type="text"
              ref={inputRef}
              className="input-box"
              placeholder={isListening ? "Listening for command..." : "Enter directive or click mic (Ctrl+K)..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              autoFocus
            />
            <button
              className={`send-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListening}
              style={{ marginRight: '10px' }}
            >
              {isListening ? (
                <div className="voice-indicator">
                  <div className="bar"></div>
                  <div className="bar" style={{ animationDelay: '0.2s' }}></div>
                  <div className="bar" style={{ animationDelay: '0.4s' }}></div>
                </div>
              ) : (
                <Mic size={20} />
              )}
            </button>
            <button className="send-btn" onClick={() => handleSend()}>
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
