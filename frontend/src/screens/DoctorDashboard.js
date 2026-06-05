import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function DoctorDashboard() {
  const { t, i18n } = useTranslation();
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('create'); // 'create' | 'patients'

  // Prescription creation state
  const [patientId, setPatientId] = useState('');
  const [medicinesList, setMedicinesList] = useState([
    {
      medicine_name: '',
      dosage: '',
      schedule_type: 'daily',
      duration_days: '7',
      food_instruction: 'After Food',
      custom_time: '08:00'
    }
  ]);
  const [creating, setCreating] = useState(false);
  const [selectedMedicineDetails, setSelectedMedicineDetails] = useState(null);
  const [showCalendarMed, setShowCalendarMed] = useState(null);

  // My Patients state
  const [myPatients, setMyPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [addPatientPhone, setAddPatientPhone] = useState('');
  const [addingPatient, setAddingPatient] = useState(false);

  // Patient detail view
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientMedicines, setPatientMedicines] = useState([]);
  const [loadingPatientMeds, setLoadingPatientMeds] = useState(false);

  // Editing state
  const [editingMedicine, setEditingMedicine] = useState(null);

  const fetchMyPatients = async () => {
    setLoadingPatients(true);
    try {
      const res = await axios.get(`${API_URL}/doctor/my-patients`);
      setMyPatients(res.data);
      if (res.data.length > 0 && !patientId) {
         setPatientId(res.data[0].id.toString());
      }
    } catch (e) {
      console.log('Error fetching patients', e);
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    fetchMyPatients();
  }, [tab]);

  const fetchPatientMedicines = async (pId) => {
    setLoadingPatientMeds(true);
    try {
      const res = await axios.get(`${API_URL}/prescriptions/doctor/patient/${pId}`);
      setPatientMedicines(res.data);
    } catch (error) {
      alert("Failed to fetch prescriptions");
    } finally {
      setLoadingPatientMeds(false);
    }
  }

  const handlePatientClick = (patient) => {
    setSelectedPatient(patient);
    fetchPatientMedicines(patient.id);
  }

  const handleAddPatient = async () => {
    if (!addPatientPhone) return alert("Enter phone number");
    setAddingPatient(true);
    try {
       await axios.post(`${API_URL}/doctor/add-patient`, { phone: addPatientPhone });
       alert("Patient linked!");
       setAddPatientPhone('');
       fetchMyPatients();
    } catch (e) {
       alert("Failed to add: " + (e.response?.data?.message || e.message));
    } finally {
       setAddingPatient(false);
    }
  };

  const addMedicineRow = () => {
    setMedicinesList([
      ...medicinesList,
      {
        medicine_name: '',
        dosage: '',
        schedule_type: 'daily',
        duration_days: '7',
        food_instruction: 'After Food',
        custom_time: '08:00'
      }
    ]);
  };

  const removeMedicineRow = (index) => {
    if (medicinesList.length === 1) return;
    const updated = [...medicinesList];
    updated.splice(index, 1);
    setMedicinesList(updated);
  };

  const updateMedicineRow = (index, key, val) => {
    const updated = [...medicinesList];
    updated[index][key] = val;
    setMedicinesList(updated);
  };

  const handleCreatePrescription = async () => {
    if (!patientId) {
      alert("Please select a Patient");
      return;
    }

    // Validate each medicine in the list
    for (let i = 0; i < medicinesList.length; i++) {
      const med = medicinesList[i];
      if (!med.medicine_name || !med.dosage || !med.duration_days) {
        alert(`Please fill all fields for Medicine #${i + 1}`);
        return;
      }
    }

    setCreating(true);
    try {
      const payloadMedicines = medicinesList.map(med => ({
        medicine_name: med.medicine_name,
        dosage: med.dosage,
        schedule_type: med.schedule_type,
        duration_days: parseInt(med.duration_days),
        food_instruction: med.food_instruction,
        custom_times: med.custom_time ? [med.custom_time] : []
      }));

      await axios.post(`${API_URL}/prescriptions`, {
        patientId: parseInt(patientId),
        medicines: payloadMedicines
      });
      alert('Prescription created successfully!');
      setMedicinesList([
        {
          medicine_name: '',
          dosage: '',
          schedule_type: 'daily',
          duration_days: '7',
          food_instruction: 'After Food',
          custom_time: '08:00'
        }
      ]);
    } catch (e) {
      alert('Failed to prescribe: ' + (e.response?.data?.message || e.message));
    } finally {
      setCreating(false);
    }
  };

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

  const startEdit = (med) => {
    setEditingMedicine({
      id: med.id,
      medicine_name: med.medicine_name,
      dosage: med.dosage,
      schedule_type: med.schedule_type || 'daily',
      duration_days: med.duration_days?.toString() || '7',
      food_instruction: med.food_instruction || 'After Food',
      custom_times: med.custom_times && med.custom_times.length > 0 ? med.custom_times[0].substring(0, 5) : '08:00'
    });
  }

  const handleSaveEdit = async () => {
    try {
      const payload = {
        medicine_name: editingMedicine.medicine_name,
        dosage: editingMedicine.dosage,
        schedule_type: editingMedicine.schedule_type,
        duration_days: parseInt(editingMedicine.duration_days),
        food_instruction: editingMedicine.food_instruction,
        custom_times: editingMedicine.custom_times ? [editingMedicine.custom_times] : []
      };
      
      await axios.put(`${API_URL}/prescriptions/medicine/${editingMedicine.id}`, payload);
      alert('Updated successfully!');
      setEditingMedicine(null);
      fetchPatientMedicines(selectedPatient.id);
    } catch (e) {
      alert('Failed to update: ' + (e.response?.data?.message || e.message));
    }
  }

  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setPatientMedicines([]);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
             <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
             <View style={{ flexShrink: 1 }}>
               <Text style={styles.greeting}>Dr. {userInfo?.name}</Text>
               <Text style={styles.subtitle}>MedTrack Physician Space</Text>
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
          style={[styles.tab, tab === 'create' && styles.activeTab]}
          onPress={() => {setTab('create'); setSelectedPatient(null); setEditingMedicine(null);}}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.activeTabText]}>{t('New Prescription')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, tab === 'patients' && styles.activeTab]}
          onPress={() => setTab('patients')}
        >
          <Text style={[styles.tabText, tab === 'patients' && styles.activeTabText]}>{t('My Patients')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'create' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.formCard}>
               <Text style={styles.sectionTitle}>{t('New Prescription')}</Text>
               
               <Text style={styles.label}>{t('Select Patient')}</Text>
               <View style={styles.pickerContainer}>
                 <Picker
                   selectedValue={patientId}
                   onValueChange={(itemValue) => setPatientId(itemValue)}
                 >
                   <Picker.Item label={t("-- Select Patient --")} value="" />
                   {myPatients.map(p => (
                     <Picker.Item key={p.id} label={`${p.name} (${p.phone})`} value={p.id.toString()} />
                   ))}
                 </Picker>
               </View>

               {medicinesList.map((med, index) => (
                  <View key={index} style={styles.medicineFormCard}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.medHeaderTitle}>{t('Medicine')} #{index + 1}</Text>
                        {medicinesList.length > 1 && (
                           <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedicineRow(index)}>
                              <Text style={styles.removeBtnText}>{t('Remove')}</Text>
                           </TouchableOpacity>
                        )}
                     </View>

                     <Text style={styles.label}>{t('Medicine Name')}</Text>
                     <TextInput 
                       style={styles.input} 
                       placeholder="e.g. Paracetamol" 
                       value={med.medicine_name}
                       onChangeText={(val) => updateMedicineRow(index, 'medicine_name', val)}
                     />

                     <Text style={styles.label}>{t('Dosage')}</Text>
                     <TextInput 
                       style={styles.input} 
                       placeholder="e.g. 500mg" 
                       value={med.dosage}
                       onChangeText={(val) => updateMedicineRow(index, 'dosage', val)}
                     />

                     <View style={styles.row}>
                       <View style={{flex: 1, marginRight: 8}}>
                          <Text style={styles.label}>{t('Schedule')}</Text>
                          <View style={styles.pickerContainer}>
                            <Picker selectedValue={med.schedule_type} onValueChange={(val) => updateMedicineRow(index, 'schedule_type', val)}>
                              <Picker.Item label={t("Daily")} value="daily" />
                              <Picker.Item label={t("Weekly")} value="weekly" />
                              <Picker.Item label={t("Monthly")} value="monthly" />
                            </Picker>
                          </View>
                       </View>
                       <View style={{flex: 1, marginLeft: 8}}>
                          <Text style={styles.label}>
                            {med.schedule_type === 'weekly' 
                              ? t('Weeks') 
                              : med.schedule_type === 'monthly' 
                                ? t('Months') 
                                : t('Days')}
                          </Text>
                          <TextInput 
                            style={styles.input} 
                            value={med.duration_days}
                            onChangeText={(val) => updateMedicineRow(index, 'duration_days', val)}
                            keyboardType="numeric"
                          />
                       </View>
                     </View>

                     <View style={styles.row}>
                       <View style={{flex: 1, marginRight: 8}}>
                          <Text style={styles.label}>{t('Food Instructions')}</Text>
                          <View style={styles.pickerContainer}>
                            <Picker selectedValue={med.food_instruction} onValueChange={(val) => updateMedicineRow(index, 'food_instruction', val)}>
                               <Picker.Item label={t("Before Food")} value="Before Food" />
                               <Picker.Item label={t("After Food")} value="After Food" />
                               <Picker.Item label={t("Empty Stomach")} value="Empty Stomach" />
                            </Picker>
                          </View>
                       </View>
                       <View style={{flex: 1, marginLeft: 8}}>
                          <Text style={styles.label}>{t('Alarm Time(HH:MM)')}</Text>
                          <TextInput 
                            style={styles.input} 
                            placeholder="e.g. 08:30" 
                            value={med.custom_time}
                            onChangeText={(val) => updateMedicineRow(index, 'custom_time', val)}
                          />
                       </View>
                     </View>
                  </View>
               ))}

               <TouchableOpacity style={styles.addMedicineRowBtn} onPress={addMedicineRow}>
                  <Text style={styles.addMedicineRowBtnText}>+ {t('Add Another Medicine')}</Text>
               </TouchableOpacity>

               <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePrescription} disabled={creating}>
                 {creating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>{t('Send Prescription')}</Text>}
               </TouchableOpacity>
            </View>
          </ScrollView>
        ) : editingMedicine ? (
           <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
             <View style={styles.formCard}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                   <Text style={styles.sectionTitle}>{t('Edit')}</Text>
                   <TouchableOpacity onPress={() => setEditingMedicine(null)}>
                      <Text style={{color: COLORS.primary}}>{t('Cancel')}</Text>
                   </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('Medicine Name')}</Text>
                <TextInput style={styles.input} value={editingMedicine.medicine_name} onChangeText={(val) => setEditingMedicine({...editingMedicine, medicine_name: val})} />

                <Text style={styles.label}>{t('Dosage')}</Text>
                <TextInput style={styles.input} value={editingMedicine.dosage} onChangeText={(val) => setEditingMedicine({...editingMedicine, dosage: val})} />

                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>{t('Schedule')}</Text>
                     <View style={styles.pickerContainer}>
                       <Picker selectedValue={editingMedicine.schedule_type} onValueChange={(val) => setEditingMedicine({...editingMedicine, schedule_type: val})}>
                         <Picker.Item label={t("Daily")} value="daily" />
                         <Picker.Item label={t("Weekly")} value="weekly" />
                         <Picker.Item label={t("Monthly")} value="monthly" />
                       </Picker>
                     </View>
                  </View>
                  <View style={{flex: 1, marginLeft: 8}}>
                     <Text style={styles.label}>
                       {editingMedicine.schedule_type === 'weekly' 
                          ? t('Weeks') 
                          : editingMedicine.schedule_type === 'monthly' 
                            ? t('Months') 
                            : t('Days')}
                     </Text>
                     <TextInput style={styles.input} value={editingMedicine.duration_days} onChangeText={(val) => setEditingMedicine({...editingMedicine, duration_days: val})} keyboardType="numeric" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>{t('Food Instructions')}</Text>
                     <View style={styles.pickerContainer}>
                       <Picker selectedValue={editingMedicine.food_instruction} onValueChange={(val) => setEditingMedicine({...editingMedicine, food_instruction: val})}>
                          <Picker.Item label={t("Before Food")} value="Before Food" />
                          <Picker.Item label={t("After Food")} value="After Food" />
                          <Picker.Item label={t("Empty Stomach")} value="Empty Stomach" />
                       </Picker>
                     </View>
                  </View>
                  <View style={{flex: 1, marginLeft: 8}}>
                     <Text style={styles.label}>{t('Alarm Time(HH:MM)')}</Text>
                     <TextInput style={styles.input} value={editingMedicine.custom_times} onChangeText={(val) => setEditingMedicine({...editingMedicine, custom_times: val})} />
                  </View>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleSaveEdit}>
                  <Text style={styles.primaryButtonText}>{t('Save Changes')}</Text>
                </TouchableOpacity>
             </View>
           </ScrollView>
        ) : selectedPatient ? (
           <View style={{ flex: 1 }}>
              <TouchableOpacity style={{ marginBottom: 16 }} onPress={handleBackToPatients}>
                 <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>← {t('Back to Patients')}</Text>
              </TouchableOpacity>
              <Text style={styles.h3}>{t('Medicines for ')}{selectedPatient.name}</Text>
              
              {loadingPatientMeds ? (
                <ActivityIndicator size="large" color="#1A9988" style={{ marginTop: 20 }} />
              ) : (
                <FlatList
                  data={patientMedicines}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({item}) => {
                     const completed = isMedicineCompleted(item);
                     return (
                        <TouchableOpacity 
                          style={[styles.historyCard, completed && { opacity: 0.65 }]}
                          onPress={() => setSelectedMedicineDetails(item)}
                        >
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                             <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                                <Text style={styles.medName}>{item.medicine_name}</Text>
                                {completed && (
                                   <View style={styles.completedBadge}>
                                      <Text style={styles.completedBadgeText}>{t('Completed')}</Text>
                                   </View>
                                )}
                             </View>
                             <TouchableOpacity onPress={() => startEdit(item)}>
                                <Text style={{color: COLORS.primary, fontWeight: 'bold'}}>{t('Edit')}</Text>
                             </TouchableOpacity>
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
                          {item.custom_times && <Text style={styles.medDetail}>Time: {item.custom_times.join(', ')}</Text>}
                        </TouchableOpacity>
                     );
                  }}
                  ListEmptyComponent={<Text style={{ marginTop: 20 }}>{t('No active prescriptions.')}</Text>}
                />
              )}
           </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.addPatientCard}>
               <Text style={styles.h3}>{t('Add Existing Patient')}</Text>
               <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                    placeholder={t("Patient Phone No.")} 
                    value={addPatientPhone}
                    onChangeText={setAddPatientPhone}
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity style={styles.addButton} onPress={handleAddPatient} disabled={addingPatient}>
                    {addingPatient ? <ActivityIndicator color="#FFF"/> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('Add')}</Text>}
                  </TouchableOpacity>
               </View>
            </View>

            {loadingPatients ? (
              <ActivityIndicator size="large" color="#1A9988" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={myPatients}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({item}) => (
                  <TouchableOpacity style={styles.historyCard} onPress={() => handlePatientClick(item)}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                       <View>
                          <Text style={styles.medName}>{item.name}</Text>
                          <Text style={styles.medDetail}>{t('Phone: ')}{item.phone}</Text>
                       </View>
                       <Text style={{color: COLORS.primary, fontSize: 24}}>{'>'}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>{t('No patients assigned yet.')}</Text>}
              />
            )}
          </View>
        )}
      </View>

      {/* Medicine Details Drill-Down Modal for Doctor */}
      <Modal visible={!!selectedMedicineDetails} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedMedicineDetails?.medicine_name}</Text>
            <Text style={[styles.modalDetail, { color: COLORS.primary, marginBottom: 16 }]}>
              {t('Dosage: ')}{selectedMedicineDetails?.dosage}
            </Text>
            
            <Text style={styles.modalDetail}>
              {t('Schedule: ')}
              {selectedMedicineDetails?.schedule_type ? t(selectedMedicineDetails.schedule_type.toLowerCase()) : ''}
              {` (for ${selectedMedicineDetails?.duration_days} ${
                selectedMedicineDetails?.schedule_type === 'weekly' 
                  ? t('Weeks') 
                  : selectedMedicineDetails?.schedule_type === 'monthly' 
                    ? t('Months') 
                    : t('Days')
              })`}
            </Text>
            <Text style={styles.modalDetail}>
              {t('Instruction:')} {selectedMedicineDetails?.food_instruction ? t(selectedMedicineDetails.food_instruction) : ''}
            </Text>

            {selectedMedicineDetails && (
              <View style={{ width: '100%', alignItems: 'center', marginTop: 20 }}>
                {isMedicineCompleted(selectedMedicineDetails) ? (
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
                  🔥 {calculateStreak(selectedMedicineDetails.intakes)} {t('Days Streak')}
                </Text>
                
                <Text style={styles.historyLabel}>{t('MedTrack Streak')}</Text>
                {renderWeeklyTracker(
                  selectedMedicineDetails.intakes || [], 
                  selectedMedicineDetails.start_date,
                  selectedMedicineDetails.duration_days,
                  selectedMedicineDetails.schedule_type
                )}

                {(selectedMedicineDetails.schedule_type === 'weekly' || selectedMedicineDetails.schedule_type === 'monthly' || selectedMedicineDetails.duration_days > 7) && (
                  <TouchableOpacity 
                    style={styles.viewCalendarBtn} 
                    onPress={() => setShowCalendarMed(selectedMedicineDetails)}
                  >
                    <Text style={styles.viewCalendarBtnText}>📅 {t('View Full Calendar')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity style={[styles.dismissButton, { backgroundColor: COLORS.border }]} onPress={() => setSelectedMedicineDetails(null)}>
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
  greeting: { ...TYPOGRAPHY.h2, color: '#1A9988' }, 
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
  activeTab: { backgroundColor: '#E6F4F1' },
  tabText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, fontWeight: '600' },
  activeTabText: { color: '#1A9988' },
  content: { flex: 1, padding: 16 },
  
  formCard: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  sectionTitle: { ...TYPOGRAPHY.h3, marginBottom: 16, color: '#1A9988' },
  label: { ...TYPOGRAPHY.caption, color: COLORS.text, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...TYPOGRAPHY.body,
    marginBottom: 16,
  },
  pickerContainer: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    overflow: 'hidden'
  },
  row: { flexDirection: 'row' },
  primaryButton: {
    backgroundColor: '#1A9988',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { ...TYPOGRAPHY.button },

  addPatientCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1A9988',
  },
  addButton: {
    backgroundColor: '#1A9988',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  h3: { ...TYPOGRAPHY.h3, color: '#1A9988', marginBottom: 8 },
  historyCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  medName: { ...TYPOGRAPHY.h3, marginBottom: 4 },
  medDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary },

  // Dynamic Row Prescription Styles
  medicineFormCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    ...SHADOWS.small,
  },
  medHeaderTitle: {
    ...TYPOGRAPHY.h3,
    color: '#1A9988',
    fontWeight: 'bold',
  },
  removeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 6,
  },
  removeBtnText: {
    color: COLORS.error,
    fontWeight: '600',
    fontSize: 12,
  },
  addMedicineRowBtn: {
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#1A9988',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  addMedicineRowBtnText: {
    color: '#1A9988',
    fontWeight: '700',
  },

  // Completed status & visual history styles
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
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary, marginBottom: 8 },
  modalDetail: { ...TYPOGRAPHY.body, color: COLORS.text, marginBottom: 4 },
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 24,
    width: '100%',
    alignItems: 'center'
  },
  dismissText: { ...TYPOGRAPHY.button },

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
