import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';

export default function DoctorDashboard() {
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('create'); // 'create' | 'patients'

  // Prescription creation state
  const [patientId, setPatientId] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [scheduleType, setScheduleType] = useState('daily');
  const [durationDays, setDurationDays] = useState('7');
  const [foodInstruction, setFoodInstruction] = useState('After Food');
  const [customTime, setCustomTime] = useState('08:00'); 
  const [creating, setCreating] = useState(false);

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

  const handleCreatePrescription = async () => {
    if (!patientId || !medicineName || !dosage) {
      alert("Please fill out Patient ID, Medicine, and Dosage");
      return;
    }

    setCreating(true);
    try {
      await axios.post(`${API_URL}/prescriptions`, {
        patientId: parseInt(patientId),
        medicines: [{
          medicine_name: medicineName,
          dosage: dosage,
          schedule_type: scheduleType,
          duration_days: parseInt(durationDays),
          food_instruction: foodInstruction,
          custom_times: customTime ? [customTime] : [] 
        }]
      });
      alert('Prescription created successfully!');
      setMedicineName('');
      setDosage('');
    } catch (e) {
      alert('Failed to prescribe: ' + (e.response?.data?.message || e.message));
    } finally {
      setCreating(false);
    }
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
        <View>
          <Text style={styles.greeting}>Dr. {userInfo?.name}</Text>
          <Text style={styles.subtitle}>MedTrack Physician Space</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, tab === 'create' && styles.activeTab]}
          onPress={() => {setTab('create'); setSelectedPatient(null); setEditingMedicine(null);}}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.activeTabText]}>New Prescription</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, tab === 'patients' && styles.activeTab]}
          onPress={() => setTab('patients')}
        >
          <Text style={[styles.tabText, tab === 'patients' && styles.activeTabText]}>My Patients</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'create' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.formCard}>
               <Text style={styles.sectionTitle}>Prescribe Medication</Text>
               
               <Text style={styles.label}>Select Patient</Text>
               <View style={styles.pickerContainer}>
                 <Picker
                   selectedValue={patientId}
                   onValueChange={(itemValue) => setPatientId(itemValue)}
                 >
                   <Picker.Item label="-- Select Patient --" value="" />
                   {myPatients.map(p => (
                     <Picker.Item key={p.id} label={`${p.name} (${p.phone})`} value={p.id.toString()} />
                   ))}
                 </Picker>
               </View>

               <Text style={styles.label}>Medicine Name</Text>
               <TextInput 
                 style={styles.input} 
                 placeholder="e.g. Paracetamol" 
                 value={medicineName}
                 onChangeText={setMedicineName}
               />

               <Text style={styles.label}>Dosage</Text>
               <TextInput 
                 style={styles.input} 
                 placeholder="e.g. 500mg" 
                 value={dosage}
                 onChangeText={setDosage}
               />

               <View style={styles.row}>
                 <View style={{flex: 1, marginRight: 8}}>
                    <Text style={styles.label}>Schedule</Text>
                    <View style={styles.pickerContainer}>
                      <Picker val={scheduleType} selectedValue={scheduleType} onValueChange={setScheduleType}>
                        <Picker.Item label="Daily" value="daily" />
                        <Picker.Item label="Weekly" value="weekly" />
                        <Picker.Item label="Monthly" value="monthly" />
                      </Picker>
                    </View>
                 </View>
                 <View style={{flex: 1, marginLeft: 8}}>
                    <Text style={styles.label}>Days</Text>
                    <TextInput 
                      style={styles.input} 
                      value={durationDays}
                      onChangeText={setDurationDays}
                      keyboardType="numeric"
                    />
                 </View>
               </View>

               <View style={styles.row}>
                 <View style={{flex: 1, marginRight: 8}}>
                    <Text style={styles.label}>Food Instructions</Text>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={foodInstruction} onValueChange={setFoodInstruction}>
                         <Picker.Item label="Before Food" value="Before Food" />
                         <Picker.Item label="After Food" value="After Food" />
                         <Picker.Item label="Empty Stomach" value="Empty Stomach" />
                      </Picker>
                    </View>
                 </View>
                 <View style={{flex: 1, marginLeft: 8}}>
                    <Text style={styles.label}>Alarm Time(HH:MM)</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="e.g. 08:30" 
                      value={customTime}
                      onChangeText={setCustomTime}
                    />
                 </View>
               </View>

               <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePrescription} disabled={creating}>
                 {creating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Send Prescription</Text>}
               </TouchableOpacity>
            </View>
          </ScrollView>
        ) : editingMedicine ? (
           <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
             <View style={styles.formCard}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                   <Text style={styles.sectionTitle}>Edit Prescription</Text>
                   <TouchableOpacity onPress={() => setEditingMedicine(null)}>
                      <Text style={{color: COLORS.primary}}>Cancel</Text>
                   </TouchableOpacity>
                </View>

                <Text style={styles.label}>Medicine Name</Text>
                <TextInput style={styles.input} value={editingMedicine.medicine_name} onChangeText={(val) => setEditingMedicine({...editingMedicine, medicine_name: val})} />

                <Text style={styles.label}>Dosage</Text>
                <TextInput style={styles.input} value={editingMedicine.dosage} onChangeText={(val) => setEditingMedicine({...editingMedicine, dosage: val})} />

                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>Schedule</Text>
                     <View style={styles.pickerContainer}>
                       <Picker selectedValue={editingMedicine.schedule_type} onValueChange={(val) => setEditingMedicine({...editingMedicine, schedule_type: val})}>
                         <Picker.Item label="Daily" value="daily" />
                         <Picker.Item label="Weekly" value="weekly" />
                         <Picker.Item label="Monthly" value="monthly" />
                       </Picker>
                     </View>
                  </View>
                  <View style={{flex: 1, marginLeft: 8}}>
                     <Text style={styles.label}>Days</Text>
                     <TextInput style={styles.input} value={editingMedicine.duration_days} onChangeText={(val) => setEditingMedicine({...editingMedicine, duration_days: val})} keyboardType="numeric" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>Food Instructions</Text>
                     <View style={styles.pickerContainer}>
                       <Picker selectedValue={editingMedicine.food_instruction} onValueChange={(val) => setEditingMedicine({...editingMedicine, food_instruction: val})}>
                          <Picker.Item label="Before Food" value="Before Food" />
                          <Picker.Item label="After Food" value="After Food" />
                          <Picker.Item label="Empty Stomach" value="Empty Stomach" />
                       </Picker>
                     </View>
                  </View>
                  <View style={{flex: 1, marginLeft: 8}}>
                     <Text style={styles.label}>Alarm Time(HH:MM)</Text>
                     <TextInput style={styles.input} value={editingMedicine.custom_times} onChangeText={(val) => setEditingMedicine({...editingMedicine, custom_times: val})} />
                  </View>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleSaveEdit}>
                  <Text style={styles.primaryButtonText}>Save Changes</Text>
                </TouchableOpacity>
             </View>
           </ScrollView>
        ) : selectedPatient ? (
           <View style={{ flex: 1 }}>
              <TouchableOpacity style={{ marginBottom: 16 }} onPress={handleBackToPatients}>
                 <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>← Back to Patients</Text>
              </TouchableOpacity>
              <Text style={styles.h3}>Medicines for {selectedPatient.name}</Text>
              
              {loadingPatientMeds ? (
                <ActivityIndicator size="large" color="#1A9988" style={{ marginTop: 20 }} />
              ) : (
                <FlatList
                  data={patientMedicines}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({item}) => (
                     <View style={styles.historyCard}>
                       <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                          <Text style={styles.medName}>{item.medicine_name}</Text>
                          <TouchableOpacity onPress={() => startEdit(item)}>
                             <Text style={{color: COLORS.primary, fontWeight: 'bold'}}>Edit</Text>
                          </TouchableOpacity>
                       </View>
                       <Text style={styles.medDetail}>Dosage: {item.dosage}</Text>
                       <Text style={styles.medDetail}>Schedule: {item.schedule_type} ({item.duration_days} days)</Text>
                       {item.custom_times && <Text style={styles.medDetail}>Time: {item.custom_times.join(', ')}</Text>}
                     </View>
                  )}
                  ListEmptyComponent={<Text style={{ marginTop: 20 }}>No medicines prescribed by you for this patient.</Text>}
                />
              )}
           </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.addPatientCard}>
               <Text style={styles.h3}>Add Existing Patient</Text>
               <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                    placeholder="Patient Phone No." 
                    value={addPatientPhone}
                    onChangeText={setAddPatientPhone}
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity style={styles.addButton} onPress={handleAddPatient} disabled={addingPatient}>
                    {addingPatient ? <ActivityIndicator color="#FFF"/> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Add</Text>}
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
                          <Text style={styles.medDetail}>Phone: {item.phone}</Text>
                       </View>
                       <Text style={{color: COLORS.primary, fontSize: 24}}>{'>'}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No patients assigned yet.</Text>}
              />
            )}
          </View>
        )}
      </View>
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
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary }
});
