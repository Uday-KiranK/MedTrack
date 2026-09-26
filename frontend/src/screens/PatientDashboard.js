import React, { useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Platform, Modal, Image, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment?.StoreClient;

let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.log("Notification loader note:", e.message);
}

let createAudioPlayer = null;
try {
  const expoAudio = require('expo-audio');
  createAudioPlayer = expoAudio.createAudioPlayer;
} catch (e) {}

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

export default function PatientDashboard() {
  const { t, i18n } = useTranslation();
  const { logout, userInfo, updateUserProfile } = useContext(AuthContext);
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'labs'
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [onboardingModalVisible, setOnboardingModalVisible] = useState(false);
  
  // Prescriptions state
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [showCalendarMed, setShowCalendarMed] = useState(null);

  // Patient Routine state
  const [routine, setRoutine] = useState({
    breakfast_time: userInfo?.breakfast_time || '08:00',
    lunch_time: userInfo?.lunch_time || '13:30',
    dinner_time: userInfo?.dinner_time || '20:30',
    bedtime: userInfo?.bedtime || '22:00',
    ringtone_uri: userInfo?.ringtone_uri || 'default'
  });
  const [customRingtoneName, setCustomRingtoneName] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);

  // Labs state
  const [uploadingLab, setUploadingLab] = useState(false);
  const [labSummary, setLabSummary] = useState(null);

  // Audio & Alarm state
  const soundRef = useRef(null);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [lastAlarmTime, setLastAlarmTime] = useState('');
  const speechIntervalRef = useRef(null);

  useEffect(() => {
    setupNotifications();
    fetchMedicines();
    loadCustomRingtoneName();
    if (userInfo && userInfo.routine_configured === false) {
      setOnboardingModalVisible(true);
    }
  }, []);

  const loadCustomRingtoneName = async () => {
    try {
      const name = await AsyncStorage.getItem('custom_ringtone_name');
      if (name) setCustomRingtoneName(name);
    } catch (e) {}
  };

  const setupNotifications = async () => {
    if (!Notifications) return;
    try {
      if (typeof Notifications.setNotificationHandler === 'function') {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medtrack-alarms', {
          name: 'MedTrack Alarms',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 500, 500],
          lightColor: '#1A9988',
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.ALARM,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          }
        });

        await Notifications.setNotificationCategoryAsync('MED_ALARM_CATEGORY', [
          {
            identifier: 'TAKEN_ACTION',
            buttonTitle: "✓ OK, I've Taken",
            options: {
              opensAppToForeground: true,
            },
          }
        ]);
      }
    } catch (err) {
      console.log('Notification setup note:', err.message);
    }
  };

  useEffect(() => {
    if (!Notifications) return;

    const responseListener = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response.actionIdentifier;
      const medicineId = response.notification.request.content.data?.medicineId;
      
      await stopSound();
      
      if (medicineId) {
        try {
          await axios.post(`${API_URL}/prescriptions/intake`, { medicineId });
        } catch (e) {}
        fetchMedicines();
      }
    });

    return () => {
      if (responseListener && responseListener.remove) {
        responseListener.remove();
      }
    };
  }, []);

  const calculateAlarmTimesForMed = (med) => {
    if (med.food_instruction === 'Specific Fixed Time' && med.custom_times && med.custom_times.length > 0) {
      return med.custom_times.map(t => t.substring(0, 5));
    }

    if (med.food_instruction === 'Empty Stomach') {
      return ['07:30'];
    }

    const slots = Array.isArray(med.meal_slots) && med.meal_slots.length > 0 ? med.meal_slots : ['Breakfast'];
    const times = [];

    slots.forEach((slot) => {
      let baseTimeStr = '08:00';
      if (slot === 'Breakfast') baseTimeStr = routine.breakfast_time || '08:00';
      else if (slot === 'Lunch') baseTimeStr = routine.lunch_time || '13:30';
      else if (slot === 'Dinner') baseTimeStr = routine.dinner_time || '20:30';
      else if (slot === 'Bedtime') baseTimeStr = routine.bedtime || '22:00';

      const [hStr, mStr] = baseTimeStr.split(':');
      let h = parseInt(hStr, 10) || 8;
      let m = parseInt(mStr, 10) || 0;

      if (med.food_instruction === 'After Food') {
        m += 30;
        if (m >= 60) { h = (h + 1) % 24; m -= 60; }
      } else if (med.food_instruction === 'Before Food') {
        m -= 30;
        if (m < 0) { h = (h - 1 + 24) % 24; m += 60; }
      }

      const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      times.push(formatted);
    });

    return times;
  };

  const playSound = async (medItems) => {
    try {
       await stopSound();

       const soundSource = routine.ringtone_uri && routine.ringtone_uri !== 'default' 
         ? routine.ringtone_uri 
         : 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

       if (createAudioPlayer) {
          try {
            const player = createAudioPlayer(soundSource);
            player.loop = true;
            player.play();
            soundRef.current = player;
          } catch (audioErr) {
            console.log("createAudioPlayer error", audioErr);
          }
       }

       const medNamesStr = medItems.map(m => m.medicine_name).join(', ');
       const textToSpeak = `${t('Medication Time!')} ${t('Take:')} ${medNamesStr}`;
       const lang = i18n.language === 'en' ? 'en-IN' : `${i18n.language}-IN`;
       
       if (Speech && Speech.speak) {
         Speech.speak(textToSpeak, { language: lang });
         speechIntervalRef.current = setInterval(() => {
            Speech.speak(textToSpeak, { language: lang });
         }, 6000);
       }

    } catch(err) {
       console.log("Audio play error", err);
    }
  };

  const stopSound = async () => {
    if (soundRef.current) {
       try {
         if (typeof soundRef.current.pause === 'function') soundRef.current.pause();
         if (typeof soundRef.current.remove === 'function') soundRef.current.remove();
       } catch (e) {
         console.log("Error stopping sound", e);
       }
       soundRef.current = null;
    }

    if (speechIntervalRef.current) {
       clearInterval(speechIntervalRef.current);
       speechIntervalRef.current = null;
    }

    if (Speech && Speech.stop) {
      Speech.stop();
    }
  };

  const handleDismissAlarm = async () => {
    await stopSound();
    for (const alarm of activeAlarms) {
       try {
          await axios.post(`${API_URL}/prescriptions/intake`, { medicineId: alarm.id });
       } catch (err) {
          console.log("Failed to record intake log for", alarm.medicine_name, err.message);
       }
    }
    setActiveAlarms([]);
    fetchMedicines();
  };

  useEffect(() => {
    return () => {
      stopSound();
    };
  }, []);

  const getEndPeriodDate = (item) => {
    if (!item.start_date) return new Date();
    const start = new Date(item.start_date);
    let totalDays = item.duration_days || 7;
    if (item.schedule_type === 'weekly') {
      totalDays = (item.duration_days || 1) * 7;
    } else if (item.schedule_type === 'monthly') {
      totalDays = (item.duration_days || 1) * 30;
    } else if (item.schedule_type === 'alternate_days') {
      totalDays = (item.duration_days || 1) * 2;
    } else if (item.schedule_type === 'every_3_days') {
      totalDays = (item.duration_days || 1) * 3;
    }
    return new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
  };

  const isMedicineCompleted = (item) => {
    if (!item.start_date) return false;
    const now = new Date();
    const end = getEndPeriodDate(item);
    return now > end;
  };

  const isAlarmDueToday = (med) => {
    if (!med.start_date) return true;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const start = new Date(med.start_date);
    start.setHours(0,0,0,0);

    // If start date is in the future, alarm is NOT due today
    if (today < start) return false;

    const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 3600 * 24));
    const st = (med.schedule_type || 'daily').toLowerCase();

    if (st === 'daily') {
      return diffDays < (med.duration_days || 7);
    } else if (st === 'weekly') {
      const isSameWeekday = today.getDay() === start.getDay();
      const weeksPassed = Math.floor(diffDays / 7);
      return isSameWeekday && weeksPassed < (med.duration_days || 4);
    } else if (st === 'monthly') {
      const isSameDayOfMonth = today.getDate() === start.getDate();
      const monthsPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      return isSameDayOfMonth && monthsPassed < (med.duration_days || 3);
    } else if (st === 'alternate_days' || st === 'alternate days') {
      const isEvery2nd = diffDays % 2 === 0;
      return isEvery2nd && diffDays < ((med.duration_days || 7) * 2);
    } else if (st === 'every_3_days' || st === 'every 3 days') {
      const isEvery3rd = diffDays % 3 === 0;
      return isEvery3rd && diffDays < ((med.duration_days || 7) * 3);
    }

    return diffDays < (med.duration_days || 7);
  };

  const getLocalDateString = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const formatDisplayDate = (dateObj) => {
    if (!dateObj) return 'N/A';
    const d = new Date(dateObj);
    return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const calculateStreak = (intakes) => {
    if (!intakes || intakes.length === 0) return 0;
    const datesStr = intakes.map(d => getLocalDateString(new Date(d)));
    const uniqueDates = Array.from(new Set(datesStr)).sort().reverse();
    const todayStr = getLocalDateString(new Date());
    const yesterdayStr = getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    
    if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
      return 0;
    }
    
    let streak = 0;
    let currentCheck = new Date(uniqueDates[0]);
    
    for (let i = 0; i < uniqueDates.length; i++) {
      const expectedStr = getLocalDateString(currentCheck);
      if (uniqueDates[i] === expectedStr) {
        streak++;
        currentCheck.setDate(currentCheck.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const getWeekdayHeaders = () => {
    const headers = [];
    const temp = new Date();
    const currentDay = temp.getDay();
    temp.setDate(temp.getDate() - currentDay);
    for (let i = 0; i < 7; i++) {
      headers.push(temp.toLocaleDateString(i18n.language, { weekday: 'narrow' }));
      temp.setDate(temp.getDate() + 1);
    }
    return headers;
  };

  const generate35Days = (intakes, startDateStr, durationDays, scheduleType) => {
    const calendarDays = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const intakeSet = new Set(intakes.map(d => getLocalDateString(new Date(d))));
    const start = new Date(startDateStr);
    start.setHours(0,0,0,0);
    
    let totalDays = durationDays || 7;
    if (scheduleType === 'weekly') totalDays = durationDays * 7;
    else if (scheduleType === 'monthly') totalDays = durationDays * 30;
    const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
    end.setHours(23,59,59,999);
    const startStrLocal = getLocalDateString(start);

    const endDay = new Date();
    const dayOfWeek = endDay.getDay();
    endDay.setDate(endDay.getDate() + (6 - dayOfWeek));
    endDay.setHours(0,0,0,0);

    const startDay = new Date(endDay);
    startDay.setDate(startDay.getDate() - 34);

    for (let i = 0; i < 35; i++) {
      const d = new Date(startDay);
      d.setDate(startDay.getDate() + i);
      const dStr = getLocalDateString(d);
      
      const dayNum = d.getDate();
      const isTaken = intakeSet.has(dStr);
      const isWithinPeriod = d >= start && d <= end;
      const isStart = dStr === startStrLocal;
      
      calendarDays.push({
        dayNum,
        dateStr: dStr,
        isTaken,
        isWithinPeriod,
        isFuture: d > today,
        isStart,
      });
    }
    return calendarDays;
  };

  // Foreground Alarms Interval
  useEffect(() => {
    if (medicines.length === 0) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (lastAlarmTime === currentHHMM) return;
      
      const triggeredMeds = medicines.filter(med => {
         if (isMedicineCompleted(med)) return false;
         if (!isAlarmDueToday(med)) return false;
         const alarmTimes = calculateAlarmTimesForMed(med);
         return alarmTimes.some((t) => t.startsWith(currentHHMM));
      });
      
      if (triggeredMeds.length > 0) {
         setLastAlarmTime(currentHHMM);
         setActiveAlarms(triggeredMeds);
         playSound(triggeredMeds);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [medicines, lastAlarmTime, routine]);

  const scheduleAllNotifications = async (medList) => {
    if (!Notifications) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const med of medList) {
        if (isMedicineCompleted(med)) continue;
        if (!isAlarmDueToday(med)) continue;

        const alarmTimes = calculateAlarmTimesForMed(med);
        if (!alarmTimes || alarmTimes.length === 0) continue;
        
        for (const timeStr of alarmTimes) {
          const [hourStr, minuteStr] = timeStr.split(':');
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          if (isNaN(hour) || isNaN(minute)) continue;
          
          let trigger = null;
          if (med.schedule_type === 'daily') {
            trigger = { hour, minute, repeats: true };
          } else if (med.schedule_type === 'weekly') {
            const startDate = new Date(med.start_date || Date.now());
            const weekday = startDate.getDay() + 1;
            trigger = { weekday, hour, minute, repeats: true };
          } else {
            const startDate = new Date(med.start_date || Date.now());
            const day = startDate.getDate();
            trigger = { day, hour, minute, repeats: true };
          }
          
          const title = `${t('Medication Time!')} ⏰`;
          const body = `${t('Take:')} ${med.medicine_name} (${med.dosage}) - ${med.food_instruction ? t(med.food_instruction) : ''}`;
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.MAX,
              channelId: 'medtrack-alarms',
              categoryIdentifier: 'MED_ALARM_CATEGORY',
              data: { medicineId: med.id },
            },
            trigger,
          });
        }
      }
    } catch (err) {
      console.log("Notification schedule note:", err.message);
    }
  };

  const fetchMedicines = async () => {
    setLoadingMeds(true);
    try {
      const res = await axios.get(`${API_URL}/prescriptions/my`);
      const data = Array.isArray(res.data) ? res.data : [];
      setMedicines(data);
      scheduleAllNotifications(data);
    } catch (e) {
      console.log('Fetch meds error', e); 
      setMedicines([]);
    } finally {
      setLoadingMeds(false);
    }
  };

  const handlePickRingtone = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setRoutine({ ...routine, ringtone_uri: file.uri });
        setCustomRingtoneName(file.name || 'Custom Audio');
        await AsyncStorage.setItem('custom_ringtone_name', file.name || 'Custom Audio');
        alert('Custom Ringtone selected! Tap Save Changes to keep it.');
      }
    } catch (err) {
      console.log('Failed to pick audio', err);
    }
  };

  const handleSaveRoutine = async (isOnboarding = false) => {
    setSavingRoutine(true);
    try {
      const payload = {
        breakfast_time: routine.breakfast_time,
        lunch_time: routine.lunch_time,
        dinner_time: routine.dinner_time,
        bedtime: routine.bedtime,
        ringtone_uri: routine.ringtone_uri,
        routine_configured: true
      };
      const res = await axios.put(`${API_URL}/auth/profile`, payload);
      if (updateUserProfile) {
        updateUserProfile(res.data.user);
      }
      alert('Routine & Settings saved successfully!');
      if (isOnboarding) setOnboardingModalVisible(false);
      else setSettingsModalVisible(false);
      fetchMedicines();
    } catch (e) {
      alert('Failed to save routine: ' + (e.response?.data?.message || e.message));
    } finally {
      setSavingRoutine(false);
    }
  };

  const handleUploadLabReport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setUploadingLab(true);
      setLabSummary(null);

      const formData = new FormData();
      formData.append('report', {
        uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
        name: file.name || 'report.pdf',
        type: file.mimeType || 'application/pdf',
      });

      const res = await axios.post(`${API_URL}/lab/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setLabSummary(res.data);
    } catch (err) {
      alert('Failed to process lab report: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploadingLab(false);
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('
');
    return lines.map((line, index) => {
      const cleanLine = line.replace(/\*\*/g, '').trim();
      if (!cleanLine) return null;

      if (line.startsWith('###') || line.startsWith('**') && line.endsWith('**')) {
        return <Text key={index} style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginTop: 12, marginBottom: 4 }}>{cleanLine}</Text>;
      } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2, paddingLeft: 8 }}>
            <Text style={{ fontSize: 14, color: COLORS.text, marginRight: 6 }}>•</Text>
            <Text style={{ fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 }}>{cleanLine.substring(1).trim()}</Text>
          </View>
        );
      } else {
        return <Text key={index} style={{ fontSize: 14, color: COLORS.text, marginVertical: 3, lineHeight: 20 }}>{cleanLine}</Text>;
      }
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
             <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
             <View style={{ flexShrink: 1 }}>
               <Text style={TYPOGRAPHY.h2}>{t('Welcome,')} {userInfo?.name}</Text>
               <Text style={styles.subtitle}>{t('Patient Health Space')}</Text>
             </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
              <Text style={styles.settingsBtnText}>⚙️ Routine</Text>
            </TouchableOpacity>
            <LanguageButton onPress={() => setLangModalVisible(true)} />
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Text style={styles.logoutText}>{t('Logout')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, tab === 'prescriptions' && styles.activeTab]}
          onPress={() => setTab('prescriptions')}
        >
          <Text style={[styles.tabText, tab === 'prescriptions' && styles.activeTabText]}>{t('My Medications')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, tab === 'labs' && styles.activeTab]}
          onPress={() => setTab('labs')}
        >
          <Text style={[styles.tabText, tab === 'labs' && styles.activeTabText]}>{t('AI Lab Analyzer')}</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {tab === 'prescriptions' ? (
          loadingMeds ? (
            <ActivityIndicator size="large" color="#1A9988" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={medicines}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const completed = isMedicineCompleted(item);
                const isClinicPharmacy = item.availability_source === 'clinic_pharmacy';
                const alarmTimes = calculateAlarmTimesForMed(item);
                const isTodayDue = isAlarmDueToday(item);

                return (
                  <View style={[styles.card, completed && styles.cardCompleted]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.medName}>{item.medicine_name}</Text>
                          {isClinicPharmacy ? (
                            <View style={styles.clinicBadge}>
                              <Text style={styles.clinicBadgeText}>✓ Clinic Inventory Stock</Text>
                            </View>
                          ) : (
                            <View style={styles.outsideBadge}>
                              <Text style={styles.outsideBadgeText}>🛒 Buy Outside</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.medDetail}>{item.dosage} • {item.medicine_form || 'Tablet'}</Text>
                      </View>

                      {completed ? (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText}>{t('Completed')}</Text>
                        </View>
                      ) : (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>{t('Active')}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.dateRangeBox}>
                      <Text style={styles.dateRangeText}>
                        🗓️ <Text style={{ fontWeight: '700' }}>Schedule:</Text> {item.schedule_type ? t(item.schedule_type.toLowerCase()) : 'daily'} ({item.duration_days || 7} days)
                      </Text>
                      <Text style={styles.dateRangeText}>
                        ⏰ <Text style={{ fontWeight: '700' }}>Alarm Times:</Text> {alarmTimes.join(', ')}
                      </Text>
                      <Text style={styles.dateRangeText}>
                        🍽️ <Text style={{ fontWeight: '700' }}>Instruction:</Text> {item.food_instruction ? t(item.food_instruction) : 'After Food'}
                      </Text>
                      <Text style={styles.dateRangeText}>
                        🚀 <Text style={{ fontWeight: '700' }}>Starts:</Text> {formatDisplayDate(item.start_date || new Date())} {isTodayDue ? ' (Fires Today 🔔)' : ' (Starts Later)'}
                      </Text>
                    </View>

                    <TouchableOpacity 
                      style={styles.showHistoryBtn}
                      onPress={() => setShowCalendarMed(item)}
                    >
                      <Text style={styles.showHistoryBtnText}>📅 {t('View History & Streak Calendar')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('No prescribed medications found.')}</Text>}
            />
          )
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.uploadSection}>
              <Text style={styles.sectionTitle}>🧪 {t('AI Medical Report Analyzer')}</Text>
              <Text style={styles.sectionSubtitle}>
                {t('Upload your lab results (PDF or Image) to get instant patient-friendly explanations in your preferred language.')}
              </Text>

              <TouchableOpacity style={styles.primaryButton} onPress={handleUploadLabReport} disabled={uploadingLab}>
                {uploadingLab ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>📄 {t('Upload Lab Report (PDF/Image)')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {labSummary && (
              <View style={styles.summaryContainer}>
                <Text style={styles.successTitle}>✓ {t('Report Analyzed')}</Text>
                
                <View style={styles.summaryBox}>
                  {renderFormattedText(labSummary.summary)}
                </View>
                
                <Text style={styles.disclaimer}>{t('Note:')} {t('disclaimer_text')}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Persistent Alarm Modal */}
      <Modal visible={activeAlarms.length > 0} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{fontSize: 44, marginBottom: 12}}>⏰</Text>
            <Text style={styles.modalTitle}>{t('Medication Time!')}</Text>
            
            <ScrollView style={{ width: '100%', maxHeight: 220 }} contentContainerStyle={{ alignItems: 'center' }}>
              {activeAlarms.map((alarm, idx) => (
                 <View key={alarm.id} style={{ marginVertical: 8, alignItems: 'center', borderBottomWidth: idx < activeAlarms.length - 1 ? 1 : 0, borderBottomColor: COLORS.border, width: '100%', paddingBottom: 8 }}>
                   <Text style={styles.modalMedName}>{alarm.medicine_name}</Text>
                   <Text style={styles.modalDetail}>{t('Take:')} {alarm.dosage}</Text>
                   <Text style={styles.modalDetail}>{t('Instruction:')} {alarm.food_instruction ? t(alarm.food_instruction) : ''}</Text>
                 </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.dismissButton} onPress={handleDismissAlarm}>
               <Text style={styles.dismissText}>{t("✓ OK, I've taken it!")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Initial Routine Onboarding Modal (Properly styled white card) */}
      <Modal visible={onboardingModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.routineModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.routineModalTitle}>Welcome! Set Your Daily Routine ☀️</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={styles.routineModalSub}>Please set your usual meal times so MedTrack can schedule your medication alarms accurately.</Text>

              <Text style={styles.routineLabel}>Breakfast Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.breakfast_time} 
                onChangeText={(val) => setRoutine({ ...routine, breakfast_time: val })} 
                placeholder="08:00" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Lunch Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.lunch_time} 
                onChangeText={(val) => setRoutine({ ...routine, lunch_time: val })} 
                placeholder="13:30" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Dinner Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.dinner_time} 
                onChangeText={(val) => setRoutine({ ...routine, dinner_time: val })} 
                placeholder="20:30" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Bedtime (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.bedtime} 
                onChangeText={(val) => setRoutine({ ...routine, bedtime: val })} 
                placeholder="22:00" 
                placeholderTextColor="#64748B"
              />

              <TouchableOpacity style={styles.saveRoutineBtn} onPress={() => handleSaveRoutine(true)} disabled={savingRoutine}>
                {savingRoutine ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveRoutineBtnText}>Save & Get Started</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Routine & Settings Modal */}
      <Modal visible={settingsModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.routineModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.routineModalTitle}>⚙️ Routine & Alarm Settings</Text>
              <TouchableOpacity onPress={() => { stopSound(); setSettingsModalVisible(false); }}>
                <Text style={styles.closeModalCross}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={styles.routineLabel}>Breakfast Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.breakfast_time} 
                onChangeText={(val) => setRoutine({ ...routine, breakfast_time: val })} 
                placeholder="08:00" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Lunch Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.lunch_time} 
                onChangeText={(val) => setRoutine({ ...routine, lunch_time: val })} 
                placeholder="13:30" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Dinner Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.dinner_time} 
                onChangeText={(val) => setRoutine({ ...routine, dinner_time: val })} 
                placeholder="20:30" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Bedtime (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.bedtime} 
                onChangeText={(val) => setRoutine({ ...routine, bedtime: val })} 
                placeholder="22:00" 
                placeholderTextColor="#64748B"
              />

              <Text style={styles.routineLabel}>Select Global Ringtone 🎵</Text>
              <View style={{ marginBottom: 12 }}>
                <TouchableOpacity 
                  style={[styles.ringtoneOption, (routine.ringtone_uri === 'default' || !routine.ringtone_uri) && styles.ringtoneOptionActive]}
                  onPress={() => setRoutine({ ...routine, ringtone_uri: 'default' })}
                >
                  <Text style={[styles.ringtoneText, (routine.ringtone_uri === 'default' || !routine.ringtone_uri) && styles.ringtoneTextActive]}>
                    {(routine.ringtone_uri === 'default' || !routine.ringtone_uri) ? '✓ ' : ''}Default Beep 🔔
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.ringtoneOption, routine.ringtone_uri !== 'default' && routine.ringtone_uri !== '' && styles.ringtoneOptionActive]}
                  onPress={handlePickRingtone}
                >
                  <Text style={[styles.ringtoneText, routine.ringtone_uri !== 'default' && routine.ringtone_uri !== '' && styles.ringtoneTextActive]}>
                    {routine.ringtone_uri !== 'default' && routine.ringtone_uri !== '' ? '✓ Custom Audio: ' + (customRingtoneName || 'Selected') : '🎵 Upload Custom Ringtone'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.saveRoutineBtn} onPress={() => handleSaveRoutine(false)} disabled={savingRoutine}>
                {savingRoutine ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveRoutineBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full Streak Calendar Modal */}
      <Modal visible={!!showCalendarMed} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 8 }}>
              <Text style={styles.calendarTitle}>{t('MedTrack Streak History')}</Text>
              <TouchableOpacity onPress={() => setShowCalendarMed(null)} style={styles.closeBtnIcon}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.calendarSubTitle}>
              {showCalendarMed?.medicine_name}
            </Text>

            <Text style={styles.streakCount}>
              🔥 {calculateStreak(showCalendarMed?.intakes || [])} {t('Days Streak')}
            </Text>
            
            <View style={styles.weekdayHeaderRow}>
              {getWeekdayHeaders().map((day, idx) => (
                <Text key={idx} style={styles.weekdayLabel}>{day}</Text>
              ))}
            </View>
            
            <View style={styles.calendarGrid}>
              {showCalendarMed && generate35Days(
                showCalendarMed.intakes || [],
                showCalendarMed.start_date,
                showCalendarMed.duration_days,
                showCalendarMed.schedule_type
              ).map((day, idx) => {
                let cellStyle = styles.cellUnprescribed;
                let textStyle = styles.cellUnprescribedText;
                
                if (day.isTaken) {
                  cellStyle = styles.cellTaken;
                  textStyle = styles.cellTakenText;
                } else if (day.isFuture) {
                  cellStyle = styles.cellFuture;
                  textStyle = styles.cellFutureText;
                } else if (day.isWithinPeriod) {
                  cellStyle = styles.cellMissed;
                  textStyle = styles.cellMissedText;
                }
                
                return (
                  <View key={idx} style={[styles.calendarCell, cellStyle, day.isStart && styles.calendarStartCell]}>
                    <Text style={[styles.calendarCellText, textStyle, day.isStart && styles.calendarStartCellText]}>{day.dayNum}</Text>
                    {day.isStart && (
                      <Text style={styles.calendarStartStar}>★</Text>
                    )}
                  </View>
                );
              })}
            </View>
            
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellTaken]} />
                <Text style={styles.legendText}>{t('Taken')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellMissed]} />
                <Text style={styles.legendText}>{t('Missed')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellUnprescribed]} />
                <Text style={styles.legendText}>{t('Inactive')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellFuture]} />
                <Text style={styles.legendText}>{t('Future')}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.dismissButton, { backgroundColor: COLORS.border, marginTop: 16 }]} 
              onPress={() => setShowCalendarMed(null)}
            >
              <Text style={[styles.dismissText, { color: COLORS.text }]}>{t('Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Language Selector Modal */}
      <LanguageSelectorModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: 20,
    paddingTop: 50,
    backgroundColor: COLORS.surface,
    flexDirection: 'column',
    ...SHADOWS.small,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  logoImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain'
  },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  settingsBtn: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE'
  },
  settingsBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 10,
  },
  logoutText: { color: COLORS.error, fontWeight: '600' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    paddingVertical: 14,
    marginRight: 24,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { ...TYPOGRAPHY.button, color: COLORS.textSecondary },
  activeTabText: { color: COLORS.primary },
  content: { flex: 1, padding: 20 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary, ...TYPOGRAPHY.body },
  card: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
    ...SHADOWS.medium,
  },
  cardCompleted: { opacity: 0.6, backgroundColor: '#F8FAFC' },
  medName: { ...TYPOGRAPHY.h2, color: COLORS.primary, flexShrink: 1 },
  clinicBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  clinicBadgeText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  outsideBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  outsideBadgeText: { color: '#4B5563', fontSize: 11, fontWeight: '600' },
  completedBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  completedBadgeText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  activeBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadgeText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  medDetail: { ...TYPOGRAPHY.body, marginTop: 4, color: COLORS.textSecondary },
  dateRangeBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  dateRangeText: { fontSize: 13, color: '#475569', marginVertical: 2 },
  showHistoryBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  showHistoryBtnText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  uploadSection: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    ...SHADOWS.small,
  },
  sectionTitle: { ...TYPOGRAPHY.h2, color: COLORS.text, marginBottom: 8 },
  sectionSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 16 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...TYPOGRAPHY.button },
  summaryContainer: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 16,
    ...SHADOWS.small,
  },
  successTitle: { ...TYPOGRAPHY.h2, color: COLORS.success, marginBottom: 16 },
  summaryBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  summaryText: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 14 },
  disclaimer: { fontSize: 12, color: COLORS.textSecondary, italic: true },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    ...SHADOWS.large,
  },
  modalTitle: { ...TYPOGRAPHY.h1, color: COLORS.primary, marginBottom: 12, textAlign: 'center' },
  modalMedName: { ...TYPOGRAPHY.h2, color: COLORS.text, textAlign: 'center' },
  modalDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
  },
  dismissText: { ...TYPOGRAPHY.button },
  routineModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    width: '94%',
    maxWidth: 400,
    maxHeight: '85%',
    alignSelf: 'center',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  routineModalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  closeModalCross: { fontSize: 22, color: '#64748B', fontWeight: 'bold', padding: 4 },
  routineModalSub: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 16 },
  routineLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 6, marginTop: 10 },
  routineInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    width: '100%',
  },
  saveRoutineBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  saveRoutineBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  ringtoneOption: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginTop: 8,
    width: '100%',
  },
  ringtoneOptionActive: {
    backgroundColor: '#E0F2FE',
    borderColor: COLORS.primary,
  },
  ringtoneText: { fontSize: 14, color: '#334155', fontWeight: '600' },
  ringtoneTextActive: { color: COLORS.primary, fontWeight: '700' },
  calendarModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large
  },
  closeBtnIcon: { padding: 4 },
  closeBtnText: { fontSize: 18, color: COLORS.textSecondary, fontWeight: 'bold' },
  calendarTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary },
  calendarSubTitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 12, textAlign: 'center' },
  streakCount: { fontSize: 16, fontWeight: '800', color: '#D97706', marginBottom: 16 },
  weekdayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 4,
  },
  weekdayLabel: { width: '12%', textAlign: 'center', fontWeight: 'bold', color: COLORS.textSecondary, fontSize: 12 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-start' },
  calendarCell: {
    width: '12.2%',
    aspectRatio: 1,
    margin: '1%',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  calendarCellText: { fontSize: 12, fontWeight: '600' },
  cellTaken: { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  cellTakenText: { color: '#047857' },
  cellMissed: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  cellMissedText: { color: '#B91C1C' },
  cellFuture: { backgroundColor: 'transparent', borderColor: COLORS.border, borderStyle: 'dashed' },
  cellFutureText: { color: COLORS.textSecondary },
  cellUnprescribed: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  cellUnprescribedText: { color: '#94A3B8' },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  legendText: { fontSize: 11, color: COLORS.textSecondary },
  calendarStartCell: { borderColor: '#F59E0B', borderWidth: 2 },
  calendarStartCellText: { fontWeight: '800' },
  calendarStartStar: { position: 'absolute', bottom: -1, fontSize: 8, color: '#D97706' },
});
