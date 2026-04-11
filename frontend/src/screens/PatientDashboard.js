import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Platform, Modal } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function PatientDashboard() {
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'labs'
  
  // Prescriptions state
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);

  // Labs state
  const [uploadingLab, setUploadingLab] = useState(false);
  const [labSummary, setLabSummary] = useState(null);

  useEffect(() => {
    fetchMedicines();
  }, []);

  // Audio & Alarm state
  const [sound, setSound] = useState();
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [lastAlarmTime, setLastAlarmTime] = useState('');

  // Setup loop
  const playSound = async () => {
    try {
       const { sound } = await Audio.Sound.createAsync(
         { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
         { shouldPlay: true, isLooping: true }
       );
       setSound(sound);
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
    setActiveAlarm(null);
  }

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // Simulated Alarms (Runs every 10 seconds)
  useEffect(() => {
    if (medicines.length === 0) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (lastAlarmTime === currentHHMM) return; // Prevent re-triggering within the same minute
      
      const triggeredMed = medicines.find(med => med.custom_times && med.custom_times.some((t) => t.startsWith(currentHHMM)));
      
      if (triggeredMed) {
         setLastAlarmTime(currentHHMM);
         setActiveAlarm(triggeredMed);
         playSound();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [medicines, lastAlarmTime]);

  const fetchMedicines = async () => {
    setLoadingMeds(true);
    try {
      const res = await axios.get(`${API_URL}/prescriptions/my`);
      setMedicines(res.data);
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

  const renderMedicine = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.medName}>{item.medicine_name}</Text>
      <Text style={styles.medDetail}>Dosage: {item.dosage}</Text>
      <Text style={styles.medDetail}>Schedule: {item.schedule_type} ({item.duration_days} days)</Text>
      <Text style={styles.medDetail}>Food: {item.food_instruction}</Text>
      {item.instructions && <Text style={styles.medDetail}>Note: {item.instructions}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {userInfo?.name}</Text>
          <Text style={styles.subtitle}>Patient ID: {userInfo?.id}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, tab === 'prescriptions' && styles.activeTab]}
          onPress={() => setTab('prescriptions')}
        >
          <Text style={[styles.tabText, tab === 'prescriptions' && styles.activeTabText]}>My Prescriptions</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, tab === 'labs' && styles.activeTab]}
          onPress={() => setTab('labs')}
        >
          <Text style={[styles.tabText, tab === 'labs' && styles.activeTabText]}>Lab Reports</Text>
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
              ListEmptyComponent={<Text style={styles.emptyText}>No active prescriptions.</Text>}
            />
          )
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.uploadSection}>
              <Text style={styles.sectionTitle}>Understand Your Lab Report</Text>
              <Text style={styles.sectionSubtitle}>Upload a PDF or Image of your blood work, and our AI will translate it into simple language.</Text>
              
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={pickAndUploadLabReport}
                disabled={uploadingLab}
              >
                {uploadingLab ? (
                   <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Upload Report</Text>
                )}
              </TouchableOpacity>
            </View>

            {labSummary && (
              <View style={styles.summaryContainer}>
                <Text style={styles.successTitle}>AI Summary Completed ✓</Text>
                
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>{labSummary.summary}</Text>
                </View>
                
                <Text style={styles.disclaimer}>{labSummary.disclaimer}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Persistent Alarm Modal */}
      <Modal visible={!!activeAlarm} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{fontSize: 40, marginBottom: 16}}>⏰</Text>
            <Text style={styles.modalTitle}>Medication Time!</Text>
            {activeAlarm && (
               <>
                 <Text style={styles.modalMedName}>{activeAlarm.medicine_name}</Text>
                 <Text style={styles.modalDetail}>Take: {activeAlarm.dosage}</Text>
                 <Text style={styles.modalDetail}>Instruction: {activeAlarm.food_instruction}</Text>
               </>
            )}
            <TouchableOpacity style={styles.dismissButton} onPress={stopSound}>
               <Text style={styles.dismissText}>OK, I've taken it!</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.small,
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
  dismissText: { ...TYPOGRAPHY.button, fontSize: 18 }
});
