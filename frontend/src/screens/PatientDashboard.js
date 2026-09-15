import React, { useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Platform, Modal, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Notifications from 'expo-notifications';

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

// Setup background/foreground notification behaviour
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function PatientDashboard() {
  const { t, i18n } = useTranslation();
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'labs'
  const [langModalVisible, setLangModalVisible] = useState(false);
  
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
       
       const soundSource = ringtoneUri || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

       if (createAudioPlayer) {
          try {
            const player = createAudioPlayer(soundSource);
            player.loop = true;
            player.play();
            setSound(player);
          } catch (audioErr) {
            console.log("createAudioPlayer error", audioErr);
          }
       } else if (LegacyAudio) {
          try {
            const { sound: defaultSound } = await LegacyAudio.Sound.createAsync(
              { uri: soundSource },
              { shouldPlay: true, isLooping: true }
            );
            setSound(defaultSound);
          } catch (audioErr) {
            console.log("LegacyAudio error", audioErr);
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

  const stopSound = async () => {
    if (sound) {
       try {
         if (typeof sound.remove === 'function') {
           sound.remove();
         } else if (typeof sound.stop === 'function') {
           sound.stop();
         } else if (typeof sound.stopAsync === 'function') {
           await sound.stopAsync();
           await sound.unloadAsync();
         }
       } catch (e) {
         console.log("Error stopping sound", e);
       }
       setSound(null);
    }
    if (speechIntervalRef.current) {
       clearInterval(speechIntervalRef.current);
       speechIntervalRef.current = null;
    }
    if (Speech && Speech.stop) {
      Speech.stop();
    }

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
    return sound ? () => {
      try {
        if (typeof sound.remove === 'function') sound.remove();
        else if (typeof sound.unloadAsync === 'function') sound.unloadAsync();
      } catch (e) {}
    } : undefined;
  }, [sound]);

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
         return med.custom_times && med.custom_times.some((t) => t.startsWith(currentHHMM));
      });
      
      if (triggeredMeds.length > 0) {
         setLastAlarmTime(currentHHMM);
         setActiveAlarms(triggeredMeds);
         playSound(triggeredMeds);
      }
    }, 10000);

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
    const startDateFormatted = formatDisplayDate(item.start_date);
    const endDateFormatted = formatDisplayDate(getEndPeriodDate(item));
    const isClinicSource = item.availability_source === 'clinic_pharmacy';

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
            {item.schedule_type ? t(item.schedule_type.toLowerCase()) : ''}
            {` (for ${item.duration_days} ${
              item.schedule_type === 'weekly' 
                ? t('Weeks') 
                : item.schedule_type === 'monthly' 
                  ? t('Months') 
                  : t('Days')
            })`}
          </Text>
        </Text>
        <Text style={styles.medDetail}>{t('Food: ')}<Text style={{ fontWeight: '700', color: COLORS.text }}>{item.food_instruction ? t(item.food_instruction) : ''}</Text></Text>
        
        {/* Date Ranges Refinement #7 */}
        <View style={styles.dateRangeBox}>
           <Text style={styles.dateRangeText}>📅 Started On: <Text style={{ fontWeight: '700', color: COLORS.text }}>{startDateFormatted}</Text></Text>
           <Text style={styles.dateRangeText}>🏁 Ending On: <Text style={{ fontWeight: '700', color: COLORS.text }}>{endDateFormatted}</Text></Text>
        </View>

        {item.instructions && <Text style={[styles.medDetail, { marginTop: 4 }]}>{t('Note: ')}{item.instructions}</Text>}

        {/* Medicine History Button Refinement #5 */}
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

            <TouchableOpacity style={styles.dismissButton} onPress={stopSound}>
               <Text style={styles.dismissText}>{t("OK, I've taken it!")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full Streak Calendar Modal with Cross (Close) Button */}
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
               style={[styles.primaryButton, { marginTop: 16 }]} 
               onPress={() => handlePickRingtone(showCalendarMed?.id)}
            >
               <Text style={styles.primaryButtonText}>🎵 Set Custom Ringtone</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.dismissButton, { backgroundColor: COLORS.border, marginTop: 12 }]} 
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
    padding: 24,
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
    width: 60,
    height: 60,
    resizeMode: 'contain'
  },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
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
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeTab: { backgroundColor: '#E6F4F1' },
  tabText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, fontWeight: '600' },
  activeTabText: { color: '#1A9988' },
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
  cardCompleted: {
    opacity: 0.75,
    backgroundColor: '#F8FAFC',
  },
  medName: { ...TYPOGRAPHY.h3, color: COLORS.text, fontWeight: 'bold' },
  medDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary },

  activeBadge: {
    backgroundColor: '#E8F0FE',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontSize: 11,
    color: '#1A73E8',
    fontWeight: '700',
  },
  completedBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  clinicBadge: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  clinicBadgeText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '700',
  },
  outsideBadge: {
    backgroundColor: '#FFEDD5',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  outsideBadgeText: {
    fontSize: 10,
    color: '#C2410C',
    fontWeight: '700',
  },

  dateRangeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateRangeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  showHistoryBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  showHistoryBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },

  uploadSection: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  sectionTitle: { ...TYPOGRAPHY.h3, color: COLORS.primary, marginBottom: 4 },
  sectionSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 16 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { ...TYPOGRAPHY.button },

  summaryContainer: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  successTitle: { ...TYPOGRAPHY.h3, color: '#10B981', marginBottom: 12 },
  summaryBox: {
    backgroundColor: COLORS.inputBg,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  summaryText: { ...TYPOGRAPHY.body, color: COLORS.text },
  disclaimer: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontStyle: 'italic' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    ...SHADOWS.large,
  },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary, marginBottom: 8 },
  modalMedName: { ...TYPOGRAPHY.h3, color: COLORS.text, fontWeight: 'bold' },
  modalDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 4 },

  calendarModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large
  },
  calendarTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
  },
  calendarSubTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  closeBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  streakCount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#D93025',
    marginBottom: 12,
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
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    alignItems: 'center'
  },
  dismissText: { ...TYPOGRAPHY.button },
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
