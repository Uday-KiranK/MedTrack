import React, { useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Platform, Modal, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Notifications from 'expo-notifications';

// Setup background/foreground notification behaviour
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function PatientDashboard() {
  const { t, i18n } = useTranslation();
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'labs'
  
  // Prescriptions state
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [showCalendarMed, setShowCalendarMed] = useState(null);

  // Labs state
  const [uploadingLab, setUploadingLab] = useState(false);
  const [labSummary, setLabSummary] = useState(null);

  useEffect(() => {
    fetchMedicines();
  }, []);

  // Audio & Alarm state
  const [sound, setSound] = useState(null);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [lastAlarmTime, setLastAlarmTime] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const speechIntervalRef = useRef(null);

  // Setup loop
  const playSound = async (medItems) => {
    try {
       let ringtoneUri = null;
       for (const item of medItems) {
          const customRingtone = await AsyncStorage.getItem('ringtone_' + item.id);
          if (customRingtone) {
             ringtoneUri = customRingtone;
             break;
          }
       }
       
       if (ringtoneUri) {
          const { sound: customSound } = await Audio.Sound.createAsync(
            { uri: ringtoneUri },
            { shouldPlay: true, isLooping: true }
          );
          setSound(customSound);
       } else {
          const { sound: defaultSound } = await Audio.Sound.createAsync(
            { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
            { shouldPlay: true, isLooping: true }
          );
          setSound(defaultSound);
       }

       // Text To Speech Loop (reads out all matching medicines)
       const medNamesStr = medItems.map(m => m.medicine_name).join(', ');
       const textToSpeak = `${t('Medication Time!')} ${t('Take:')} ${medNamesStr}`;
       const lang = i18n.language === 'en' ? 'en-IN' : `${i18n.language}-IN`;
       
       Speech.speak(textToSpeak, { language: lang });
       speechIntervalRef.current = setInterval(() => {
          Speech.speak(textToSpeak, { language: lang });
       }, 6000);

    } catch(err) {
       console.log("Audio play error", err);
    }
  }

  const stopSound = async () => {
    if (sound) {
       await sound.stopAsync();
       await sound.unloadAsync();
       setSound(null);
    }
    if (speechIntervalRef.current) {
       clearInterval(speechIntervalRef.current);
       speechIntervalRef.current = null;
    }
    Speech.stop();

    // Record intakes for all active alarms
    for (const alarm of activeAlarms) {
       try {
          await axios.post(`${API_URL}/prescriptions/intake`, { medicineId: alarm.id });
       } catch (err) {
          console.log("Failed to record intake log for", alarm.medicine_name, err.message);
       }
    }

    setActiveAlarms([]);
    fetchMedicines(); // Refresh so streak counts and visual status update immediately
  }

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const isMedicineCompleted = (item) => {
    if (!item.start_date) return false;
    const start = new Date(item.start_date);
    const now = new Date();
    
    let totalDays = item.duration_days;
    if (item.schedule_type === 'weekly') {
      totalDays = item.duration_days * 7;
    } else if (item.schedule_type === 'monthly') {
      totalDays = item.duration_days * 30;
    }
    
    const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
    return now > end;
  };

  const getLocalDateString = (date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
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

  const renderWeeklyTracker = (intakes, startDateStr, durationDays, scheduleType) => {
    const tracker = [];
    const today = new Date();
    
    const intakeSet = new Set(intakes.map(d => getLocalDateString(new Date(d))));
    const start = new Date(startDateStr);
    
    let totalDays = durationDays;
    if (scheduleType === 'weekly') totalDays = durationDays * 7;
    else if (scheduleType === 'monthly') totalDays = durationDays * 30;
    const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
    const startStrLocal = getLocalDateString(start);

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dStr = getLocalDateString(d);
      const dayName = d.toLocaleDateString(i18n.language, { weekday: 'short' });
      
      const isTaken = intakeSet.has(dStr);
      const isWithinPeriod = d >= start && d <= end;
      const isStart = dStr === startStrLocal;
      
      tracker.push({
        dayName,
        dateStr: dStr,
        isTaken,
        isWithinPeriod,
        isFuture: d > today,
        isStart,
      });
    }

    return (
      <View style={styles.trackerRow}>
        {tracker.map((tDay, index) => {
          let dotStyle = styles.trackerDotEmpty;
          let textStyle = styles.trackerDotText;
          
          if (tDay.isTaken) {
            dotStyle = styles.trackerDotTaken;
            textStyle = styles.trackerDotTextActive;
          } else if (tDay.isFuture) {
            dotStyle = styles.trackerDotFuture;
          } else if (tDay.isWithinPeriod) {
            dotStyle = styles.trackerDotMissed;
            textStyle = styles.trackerDotTextMissed;
          }

          return (
            <View key={index} style={styles.trackerDayContainer}>
              <Text style={styles.trackerDayLabel}>{tDay.dayName}</Text>
              <View style={[styles.trackerDot, dotStyle, tDay.isStart && styles.trackerStartDot]}>
                <Text style={textStyle}>{tDay.isTaken ? '✓' : '×'}</Text>
              </View>
              {tDay.isStart && (
                <Text style={styles.startLabel}>{t('Start')}</Text>
              )}
            </View>
          );
        })}
      </View>
    );
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
    
    let totalDays = durationDays;
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

  // Simulated Alarms (Runs every 10 seconds)
  useEffect(() => {
    if (medicines.length === 0) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (lastAlarmTime === currentHHMM) return; // Prevent re-triggering within the same minute
      
      const triggeredMeds = medicines.filter(med => {
         if (isMedicineCompleted(med)) return false; // Skip completed medicines!
         return med.custom_times && med.custom_times.some((t) => t.startsWith(currentHHMM));
      });
      
      if (triggeredMeds.length > 0) {
         setLastAlarmTime(currentHHMM);
         setActiveAlarms(triggeredMeds);
         playSound(triggeredMeds);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [medicines, lastAlarmTime]);

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  async function requestNotificationPermissions() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Notification permission not granted!');
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
      console.log('Error requesting permissions', err);
      return false;
    }
  }

  const scheduleAllNotifications = async (medList) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const med of medList) {
        if (isMedicineCompleted(med)) continue;
        if (!med.custom_times || med.custom_times.length === 0) continue;
        
        for (const timeStr of med.custom_times) {
          const [hourStr, minuteStr] = timeStr.split(':');
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          if (isNaN(hour) || isNaN(minute)) continue;
          
          let trigger = null;
          if (med.schedule_type === 'daily') {
            trigger = { hour, minute, repeats: true };
          } else if (med.schedule_type === 'weekly') {
            const startDate = new Date(med.start_date);
            const weekday = startDate.getDay() + 1; // 1-indexed in Expo (1: Sunday, 2: Monday...)
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
      console.log("All notifications scheduled successfully!");
    } catch (err) {
      console.log("Error scheduling notifications", err);
    }
  };

  const fetchMedicines = async () => {
    setLoadingMeds(true);
    try {
      const res = await axios.get(`${API_URL}/prescriptions/my`);
      setMedicines(res.data);
      scheduleAllNotifications(res.data);
    } catch (e) {
      console.log('Fetch meds error', e); 
    } finally {
      setLoadingMeds(false);
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
        // Web uses actual DOM File object
        formData.append('file', fileToUpload.file);
      } else {
        // React Native requires a polyfilled object
        formData.append('file', {
          uri: fileToUpload.uri,
          type: fileToUpload.mimeType || 'application/pdf',
          name: fileToUpload.name,
        });
      }
      
      // Send the current language context so backend can leverage Sarvam AI 
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

  const handlePickRingtone = async (medId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        const fileUri = result.assets[0].uri;
        await AsyncStorage.setItem('ringtone_' + medId, fileUri);
        alert('Custom Ringtone Set successfully!');
      }
    } catch (err) {
      console.log('Failed to pick audio', err);
    }
  };

  const renderMedicine = ({ item }) => {
    const completed = isMedicineCompleted(item);
    return (
      <TouchableOpacity 
        style={[styles.card, completed && { opacity: 0.6 }]} 
        onPress={() => setSelectedMedicine(item)}
      >
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
           <Text style={styles.medName}>{item.medicine_name}</Text>
           {completed && (
              <View style={styles.completedBadge}>
                 <Text style={styles.completedBadgeText}>{t('Completed')}</Text>
              </View>
           )}
        </View>
        <Text style={styles.medDetail}>{t('Dosage: ')}{item.dosage}</Text>
        <Text style={styles.medDetail}>
          {t('Schedule: ')}
          {item.schedule_type ? t(item.schedule_type.toLowerCase()) : ''}
          {` (for ${item.duration_days} ${
            item.schedule_type === 'weekly' 
              ? t('Weeks') 
              : item.schedule_type === 'monthly' 
                ? t('Months') 
                : t('Days')
          })`}
        </Text>
        <Text style={styles.medDetail}>{t('Food: ')}{item.food_instruction ? t(item.food_instruction) : ''}</Text>
        {item.instructions && <Text style={styles.medDetail}>{t('Note: ')}{item.instructions}</Text>}
      </TouchableOpacity>
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
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>{t('Logout')}</Text>
          </TouchableOpacity>
         </View>
         <View style={styles.pickerWrapper}>
            <View style={styles.pickerContainerSmall}>
              <Picker
                selectedValue={i18n.language}
                style={{ height: 40, width: '100%', color: COLORS.text, backgroundColor: '#E6F4F1' }}
                onValueChange={(itemValue) => i18n.changeLanguage(itemValue)}
              >
                <Picker.Item label="EN (English)" value="en" color="#000" />
                <Picker.Item label="HI (हिंदी)" value="hi" color="#000" />
                <Picker.Item label="TA (தமிழ்)" value="ta" color="#000" />
                <Picker.Item label="TE (తెలుగు)" value="te" color="#000" />
                <Picker.Item label="KN (ಕನ್ನಡ)" value="kn" color="#000" />
              </Picker>
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
                  <Text style={styles.summaryText}>{labSummary.summary}</Text>
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

            <TouchableOpacity style={styles.dismissButton} onPress={stopSound}>
               <Text style={styles.dismissText}>{t("OK, I've taken it!")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Prescription Details Drill-Down Modal */}
      <Modal visible={!!selectedMedicine} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedMedicine?.medicine_name}</Text>
            {selectedMedicine?.doctor_name && (
               <Text style={[styles.modalDetail, { color: COLORS.primary, marginBottom: 16 }]}>
                 {t('Prescribed by Dr.')} {selectedMedicine.doctor_name}
               </Text>
            )}
            <Text style={styles.modalDetail}>{t('Dosage: ')}{selectedMedicine?.dosage}</Text>
            <Text style={styles.modalDetail}>
              {t('Schedule: ')}
              {selectedMedicine?.schedule_type ? t(selectedMedicine.schedule_type.toLowerCase()) : ''}
              {` (for ${selectedMedicine?.duration_days} ${
                selectedMedicine?.schedule_type === 'weekly' 
                  ? t('Weeks') 
                  : selectedMedicine?.schedule_type === 'monthly' 
                    ? t('Months') 
                    : t('Days')
              })`}
            </Text>
            <Text style={styles.modalDetail}>
              {t('Instruction:')} {selectedMedicine?.food_instruction ? t(selectedMedicine.food_instruction) : ''}
            </Text>

            {selectedMedicine && (
              <View style={{ width: '100%', alignItems: 'center', marginTop: 20 }}>
                {isMedicineCompleted(selectedMedicine) ? (
                  <View style={styles.completedMessageContainer}>
                    <Text style={styles.completedMessageText}>
                      ✓ {t('Medication period completed')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.activeMessageContainer}>
                    <Text style={styles.activeMessageText}>
                      ● {t('Active Medication')}
                    </Text>
                  </View>
                )}

                <Text style={styles.streakCount}>
                  🔥 {calculateStreak(selectedMedicine.intakes)} {t('Days Streak')}
                </Text>
                
                <Text style={styles.historyLabel}>{t('MedTrack Streak')}</Text>
                {renderWeeklyTracker(
                  selectedMedicine.intakes || [], 
                  selectedMedicine.start_date,
                  selectedMedicine.duration_days,
                  selectedMedicine.schedule_type
                )}

                {(selectedMedicine.schedule_type === 'weekly' || selectedMedicine.schedule_type === 'monthly' || selectedMedicine.duration_days > 7) && (
                  <TouchableOpacity 
                    style={styles.viewCalendarBtn} 
                    onPress={() => setShowCalendarMed(selectedMedicine)}
                  >
                    <Text style={styles.viewCalendarBtnText}>📅 {t('View Full Calendar')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity 
               style={[styles.primaryButton, { marginTop: 24 }]} 
               onPress={() => handlePickRingtone(selectedMedicine?.id)}
            >
               <Text style={styles.primaryButtonText}>🎵 Set Custom Ringtone</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.dismissButton, { backgroundColor: COLORS.border }]} onPress={() => setSelectedMedicine(null)}>
               <Text style={[styles.dismissText, { color: COLORS.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full Streak Calendar Modal */}
      <Modal visible={!!showCalendarMed} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            <Text style={styles.calendarTitle}>{t('MedTrack Streak History')}</Text>
            <Text style={styles.calendarSubTitle}>
              {showCalendarMed?.medicine_name}
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
              style={[styles.dismissButton, { backgroundColor: COLORS.border, marginTop: 20 }]} 
              onPress={() => setShowCalendarMed(null)}
            >
              <Text style={[styles.dismissText, { color: COLORS.text }]}>{t('Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: COLORS.surface,
    flexDirection: 'column',
    ...SHADOWS.small,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    width: 80,
    height: 80,
    resizeMode: 'contain'
  },
  greeting: { ...TYPOGRAPHY.h2, color: COLORS.primary },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 8,
  },
  logoutText: { color: COLORS.error, fontWeight: '600' },
  pickerWrapper: {
    width: '100%'
  },
  pickerContainerSmall: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: COLORS.primaryLight,
  },
  tabText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, fontWeight: '600' },
  activeTabText: { color: COLORS.primary },
  content: { flex: 1, padding: 16 },
  card: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  medName: { ...TYPOGRAPHY.h3, marginBottom: 8 },
  medDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 4 },
  emptyText: { ...TYPOGRAPHY.body, textAlign: 'center', marginTop: 40, color: COLORS.textSecondary },
  uploadSection: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  sectionTitle: { ...TYPOGRAPHY.h3, marginBottom: 8 },
  sectionSubtitle: { ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.textSecondary, marginBottom: 24 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: { ...TYPOGRAPHY.button },
  summaryContainer: { marginTop: 24 },
  successTitle: { ...TYPOGRAPHY.h3, color: COLORS.success, marginBottom: 12 },
  summaryBox: {
    backgroundColor: COLORS.primaryLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryText: { ...TYPOGRAPHY.body, lineHeight: 24 },
  disclaimer: { ...TYPOGRAPHY.caption, color: COLORS.error, fontStyle: 'italic', textAlign: 'center' },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    ...SHADOWS.large
  },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.error, marginBottom: 16 },
  modalMedName: { ...TYPOGRAPHY.h1, color: COLORS.primary, marginBottom: 8 },
  modalDetail: { ...TYPOGRAPHY.h3, color: COLORS.text, marginBottom: 4 },
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 24,
    width: '100%',
    alignItems: 'center'
  },
  dismissText: { ...TYPOGRAPHY.button, fontSize: 18 },

  completedBadge: {
    backgroundColor: COLORS.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  completedBadgeText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  completedMessageContainer: {
    backgroundColor: '#E6F4EA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  completedMessageText: {
    color: '#137333',
    fontWeight: '700',
    fontSize: 14,
  },
  activeMessageContainer: {
    backgroundColor: '#E8F0FE',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  activeMessageText: {
    color: '#1A73E8',
    fontWeight: '700',
    fontSize: 14,
  },
  streakCount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#D93025',
    marginVertical: 8,
  },
  historyLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  
  // Duolingo Tracker Styles
  trackerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  trackerDayContainer: {
    alignItems: 'center',
    flex: 1,
  },
  trackerDayLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  trackerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  trackerDotEmpty: {
    borderColor: COLORS.border,
    backgroundColor: '#F8FAFC',
  },
  trackerDotTaken: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  trackerDotFuture: {
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  trackerDotMissed: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  trackerDotText: {
    fontSize: 14,
    color: COLORS.border,
    fontWeight: '700',
  },
  trackerDotTextActive: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '700',
  },
  trackerDotTextMissed: {
    fontSize: 14,
    color: '#B91C1C',
    fontWeight: '700',
  },
  calendarModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large
  },
  calendarTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
    marginBottom: 8,
  },
  calendarSubTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 4,
  },
  weekdayLabel: {
    width: '12%',
    textAlign: 'center',
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'flex-start',
  },
  calendarCell: {
    width: '12.2%',
    aspectRatio: 1,
    margin: '1%',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  calendarCellText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cellTaken: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  cellTakenText: {
    color: '#047857',
  },
  cellMissed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  cellMissedText: {
    color: '#B91C1C',
  },
  cellFuture: {
    backgroundColor: 'transparent',
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  cellFutureText: {
    color: COLORS.textSecondary,
  },
  cellUnprescribed: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  cellUnprescribedText: {
    color: '#94A3B8',
  },
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
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  viewCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 8,
    marginTop: 12,
    width: '100%',
    backgroundColor: '#F0FDFA',
  },
  viewCalendarBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  trackerStartDot: {
    borderColor: '#F59E0B',
    borderWidth: 3,
  },
  startLabel: {
    fontSize: 9,
    color: '#D97706',
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  calendarStartCell: {
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  calendarStartCellText: {
    fontWeight: '800',
  },
  calendarStartStar: {
    position: 'absolute',
    bottom: -1,
    fontSize: 8,
    color: '#D97706',
  },
});
