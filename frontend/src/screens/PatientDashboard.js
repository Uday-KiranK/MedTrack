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
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.log("Notification loader note:", e.message);
  }
}

// Safe Audio loader for SDK 57 compatibility
let createAudioPlayer = null;
let LegacyAudio = null;
try {
  const expoAudio = require('expo-audio');
  createAudioPlayer = expoAudio.createAudioPlayer;
} catch (e) {}

try {
  LegacyAudio = require('expo-av').Audio;
} catch (e) {}

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

const RINGTONE_OPTIONS = [
  { label: 'Default Beep', value: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
  { label: 'Gentle Chime', value: 'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm.ogg' },
  { label: 'Classic Alarm', value: 'https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg' },
  { label: 'Soft Bell', value: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' }
];

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
    lunch_time: userInfo?.lunch_time || '13:00',
    dinner_time: userInfo?.dinner_time || '20:00',
    bedtime: userInfo?.bedtime || '22:00',
    ringtone_uri: userInfo?.ringtone_uri || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg'
  });
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
    fetchMedicines();
    if (userInfo && userInfo.routine_configured === false) {
      setOnboardingModalVisible(true);
    }
  }, []);

  const calculateAlarmTimesForMed = (med) => {
    if (med.food_instruction === 'Specific Fixed Time' && med.custom_times && med.custom_times.length > 0) {
      return med.custom_times;
    }

    const slots = Array.isArray(med.meal_slots) && med.meal_slots.length > 0 ? med.meal_slots : ['Breakfast'];
    const times = [];

    slots.forEach((slot) => {
      let baseTimeStr = '08:00';
      if (slot === 'Breakfast') baseTimeStr = routine.breakfast_time || '08:00';
      else if (slot === 'Lunch') baseTimeStr = routine.lunch_time || '13:00';
      else if (slot === 'Dinner') baseTimeStr = routine.dinner_time || '20:00';
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
       await stopSound(); // Stop any currently playing audio

       const soundSource = routine.ringtone_uri || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

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

       // Text To Speech Loop (reads out all matching medicines)
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

  const testRingtone = async (uri) => {
    try {
      await stopSound();
      if (createAudioPlayer) {
        const player = createAudioPlayer(uri);
        player.play();
        soundRef.current = player;
      }
    } catch (e) {
      console.log('Error testing ringtone', e);
    }
  };

  const stopSound = async () => {
    if (soundRef.current) {
       try {
         if (typeof soundRef.current.remove === 'function') {
           soundRef.current.remove();
         } else if (typeof soundRef.current.stop === 'function') {
           soundRef.current.stop();
         } else if (typeof soundRef.current.unloadAsync === 'function') {
           await soundRef.current.unloadAsync();
         }
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
    fetchMedicines(); // Refresh streak counts and visual status
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
      totalDays = item.duration_days * 7;
    } else if (item.schedule_type === 'monthly') {
      totalDays = item.duration_days * 30;
    }
    return new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
  };

  const isMedicineCompleted = (item) => {
    if (!item.start_date) return false;
    const now = new Date();
    const end = getEndPeriodDate(item);
    return now > end;
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

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  async function requestNotificationPermissions() {
    if (!Notifications) return false;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        return false;
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medtrack-alarms', {
          name: 'MedTrack Alarms',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
        });
      }
      return true;
    } catch (err) {
      console.log('Notification permission note:', err.message);
      return false;
    }
  }

  const scheduleAllNotifications = async (medList) => {
    if (!Notifications) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const med of medList) {
        if (isMedicineCompleted(med)) continue;
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
            const startDate = new Date(med.start_date);
            const weekday = startDate.getDay() + 1;
            trigger = { weekday, hour, minute, repeats: true };
          } else {
            const startDate = new Date(med.start_date);
            const day = startDate.getDate();
            trigger = { day, hour, minute, repeats: true };
          }
          
          const title = `${t('Medication Time!')} ⏰`;
          const body = `${t('Take:')} ${med.medicine_name} (${med.dosage}) - ${med.food_instruction ? t(med.food_instruction) : ''}`;
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
              channelId: 'medtrack-alarms',
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

  const pickAndUploadLabReport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileToUpload = result.assets[0];
      setUploadingLab(true);
      setLabSummary(null);

      const formData = new FormData();
      if (Platform.OS === 'web') {
        formData.append('file', fileToUpload.file);
      } else {
        formData.append('file', {
          uri: fileToUpload.uri,
          type: fileToUpload.mimeType || 'application/pdf',
          name: fileToUpload.name,
        });
      }
      
      formData.append('lang', i18n.language);

      const response = await axios.post(`${API_URL}/labs/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setLabSummary(response.data);
    } catch (e) {
      alert("Failed to upload or parse report: " + (e.response?.data?.error || e.message));
    } finally {
      setUploadingLab(false);
    }
  };

  const renderMedicine = ({ item }) => {
    const completed = isMedicineCompleted(item);
    const startDateFormatted = formatDisplayDate(item.start_date);
    const endDateFormatted = formatDisplayDate(getEndPeriodDate(item));
    const isClinicSource = item.availability_source === 'clinic_pharmacy';
    const computedAlarmTimes = calculateAlarmTimesForMed(item);

    return (
      <View style={[styles.card, completed && styles.cardCompleted]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
             <Text style={styles.medName}>{item.medicine_name}</Text>
             {isClinicSource ? (
               <View style={styles.clinicBadge}>
                 <Text style={styles.clinicBadgeText}>Available at Clinic Pharmacy</Text>
               </View>
             ) : (
               <View style={styles.outsideBadge}>
                 <Text style={styles.outsideBadgeText}>Buy Outside</Text>
               </View>
             )}
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

        <Text style={styles.medDetail}>{t('Dosage: ')}<Text style={{ fontWeight: '700', color: COLORS.text }}>{item.dosage}</Text></Text>
        <Text style={styles.medDetail}>
          {t('Schedule: ')}
          <Text style={{ fontWeight: '700', color: COLORS.text }}>
            {item.custom_schedule_text || (item.schedule_type ? t(item.schedule_type.toLowerCase()) : '')}
            {` (for ${item.duration_days} ${
              item.schedule_type === 'weekly' 
                ? t('Weeks') 
                : item.schedule_type === 'monthly' 
                  ? t('Months') 
                  : t('Days')
            })`}
          </Text>
        </Text>
        <Text style={styles.medDetail}>{t('Food / Instruction: ')}<Text style={{ fontWeight: '700', color: COLORS.text }}>{item.food_instruction ? t(item.food_instruction) : ''}</Text></Text>
        <Text style={styles.medDetail}>⏰ {t('Calculated Alarm Times: ')}<Text style={{ fontWeight: '700', color: COLORS.primary }}>{computedAlarmTimes.join(', ')}</Text></Text>
        
        {/* Date Ranges */}
        <View style={styles.dateRangeBox}>
           <Text style={styles.dateRangeText}>📅 Started On: <Text style={{ fontWeight: '700', color: COLORS.text }}>{startDateFormatted}</Text></Text>
           <Text style={styles.dateRangeText}>🏁 Ending On: <Text style={{ fontWeight: '700', color: COLORS.text }}>{endDateFormatted}</Text></Text>
        </View>

        {item.instructions && <Text style={[styles.medDetail, { marginTop: 4 }]}>{t('Note: ')}{item.instructions}</Text>}

        {/* Medicine History Button */}
        <TouchableOpacity 
          style={styles.showHistoryBtn}
          onPress={() => setShowCalendarMed(item)}
        >
          <Text style={styles.showHistoryBtnText}>📅 Show Medicine History / Streak</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');

    return (
      <View>
        {lines.map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <View key={lineIdx} style={{ height: 6 }} />;
          }

          const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ');
          const cleanLine = isBullet ? trimmed.replace(/^[-•*]\s*/, '') : trimmed;

          return (
            <Text key={lineIdx} style={[styles.summaryText, { marginBottom: isBullet ? 6 : 4 }]}>
              {isBullet && <Text style={{ fontWeight: '700', color: COLORS.primary }}>• </Text>}
              {cleanLine}
            </Text>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
         <View style={styles.headerTop}>
           <View style={styles.brandRow}>
             <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
             <View style={{ flexShrink: 1 }}>
               <Text style={[styles.subtitle, { color: COLORS.primary, fontWeight: 'bold' }]}>
                 {t('Patient Name:')} {userInfo?.name}
               </Text>
               <Text style={styles.subtitle}>{t('Patient ID:')} {userInfo?.id}</Text>
             </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
              <Text style={styles.settingsBtnText}>⚙️ Routine & Ringtone</Text>
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
          <Text style={[styles.tabText, tab === 'prescriptions' && styles.activeTabText]}>{t('My Prescriptions')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, tab === 'labs' && styles.activeTab]}
          onPress={() => setTab('labs')}
        >
          <Text style={[styles.tabText, tab === 'labs' && styles.activeTabText]}>{t('Lab Reports')}</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {tab === 'prescriptions' ? (
          loadingMeds ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={medicines}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderMedicine}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('No active prescriptions.')}</Text>}
            />
          )
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.uploadSection}>
              <Text style={styles.sectionTitle}>{t('Understand Your Lab Report')}</Text>
              <Text style={styles.sectionSubtitle}>{t('Upload a PDF or Image of your lab report, and our AI will translate it into simple language.')}</Text>
              
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={pickAndUploadLabReport}
                disabled={uploadingLab}
              >
                {uploadingLab ? (
                   <ActivityIndicator color="#FFF" />
                ) : (
                   <Text style={styles.primaryButtonText}>{t('Upload Report')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {labSummary && (
              <View style={styles.summaryContainer}>
                <Text style={styles.successTitle}>{t('AI Summary Completed')}</Text>
                
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
            <Text style={{fontSize: 40, marginBottom: 16}}>⏰</Text>
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
               <Text style={styles.dismissText}>{t("OK, I've taken it!")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Initial Routine Onboarding Modal */}
      <Modal visible={onboardingModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.routineModalContent}>
            <Text style={styles.routineModalTitle}>Welcome! Set Your Daily Routine ☀️</Text>
            <Text style={styles.routineModalSub}>Please set your usual meal times so MedTrack can schedule your alarms accurately (e.g. 30 mins after breakfast).</Text>

            <Text style={styles.routineLabel}>Breakfast Time (HH:MM)</Text>
            <TextInput 
              style={styles.routineInput} 
              value={routine.breakfast_time} 
              onChangeText={(val) => setRoutine({ ...routine, breakfast_time: val })} 
              placeholder="08:00" 
            />

            <Text style={styles.routineLabel}>Lunch Time (HH:MM)</Text>
            <TextInput 
              style={styles.routineInput} 
              value={routine.lunch_time} 
              onChangeText={(val) => setRoutine({ ...routine, lunch_time: val })} 
              placeholder="13:00" 
            />

            <Text style={styles.routineLabel}>Dinner Time (HH:MM)</Text>
            <TextInput 
              style={styles.routineInput} 
              value={routine.dinner_time} 
              onChangeText={(val) => setRoutine({ ...routine, dinner_time: val })} 
              placeholder="20:00" 
            />

            <Text style={styles.routineLabel}>Bedtime (HH:MM)</Text>
            <TextInput 
              style={styles.routineInput} 
              value={routine.bedtime} 
              onChangeText={(val) => setRoutine({ ...routine, bedtime: val })} 
              placeholder="22:00" 
            />

            <TouchableOpacity style={styles.saveRoutineBtn} onPress={() => handleSaveRoutine(true)} disabled={savingRoutine}>
              {savingRoutine ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveRoutineBtnText}>Save & Get Started</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Routine & Settings Modal */}
      <Modal visible={settingsModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={styles.routineModalContent}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12 }}>
                <Text style={styles.routineModalTitle}>⚙️ Routine & Alarm Settings</Text>
                <TouchableOpacity onPress={() => { stopSound(); setSettingsModalVisible(false); }}>
                  <Text style={{ fontSize: 20, color: COLORS.textSecondary, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.routineLabel}>Breakfast Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.breakfast_time} 
                onChangeText={(val) => setRoutine({ ...routine, breakfast_time: val })} 
                placeholder="08:00" 
              />

              <Text style={styles.routineLabel}>Lunch Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.lunch_time} 
                onChangeText={(val) => setRoutine({ ...routine, lunch_time: val })} 
                placeholder="13:00" 
              />

              <Text style={styles.routineLabel}>Dinner Time (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.dinner_time} 
                onChangeText={(val) => setRoutine({ ...routine, dinner_time: val })} 
                placeholder="20:00" 
              />

              <Text style={styles.routineLabel}>Bedtime (HH:MM)</Text>
              <TextInput 
                style={styles.routineInput} 
                value={routine.bedtime} 
                onChangeText={(val) => setRoutine({ ...routine, bedtime: val })} 
                placeholder="22:00" 
              />

              <Text style={styles.routineLabel}>Select Global Ringtone 🎵</Text>
              <View style={{ width: '100%', marginBottom: 12 }}>
                {RINGTONE_OPTIONS.map((opt) => {
                  const selected = routine.ringtone_uri === opt.value;
                  return (
                    <TouchableOpacity 
                      key={opt.value} 
                      style={[styles.ringtoneOption, selected && styles.ringtoneOptionActive]}
                      onPress={() => {
                        setRoutine({ ...routine, ringtone_uri: opt.value });
                        testRingtone(opt.value);
                      }}
                    >
                      <Text style={[styles.ringtoneText, selected && styles.ringtoneTextActive]}>{selected ? '✓ ' : ''}{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.saveRoutineBtn} onPress={() => handleSaveRoutine(false)} disabled={savingRoutine}>
                {savingRoutine ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveRoutineBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    width: 50,
    height: 50,
    resizeMode: 'contain'
  },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  settingsBtn: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE'
  },
  settingsBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 8,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  routineModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...SHADOWS.large
  },
  routineModalTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary, marginBottom: 8 },
  routineModalSub: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 16 },
  routineLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4, marginTop: 8 },
  routineInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  saveRoutineBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveRoutineBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  ringtoneOption: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  ringtoneOptionActive: {
    backgroundColor: '#E0F2FE',
    borderColor: COLORS.primary,
  },
  ringtoneText: { fontSize: 14, color: '#334155', fontWeight: '500' },
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
