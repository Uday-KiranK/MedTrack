import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

export default function DoctorDashboard() {
  const { t, i18n } = useTranslation();
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('create'); // 'create' | 'patients' | 'inventory'
  const [langModalVisible, setLangModalVisible] = useState(false);

  // Prescription creation state
  const [patientId, setPatientId] = useState('');
  const [medicinesList, setMedicinesList] = useState([
    {
      medicine_name: '',
      dosage: '',
      schedule_type: 'daily',
      duration_days: '7',
      food_instruction: 'After Food',
      custom_time: '08:00',
      availability_source: 'buy_outside',
      suggestions: [],
      showSuggestions: false
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

  // Pharmacy Inventory State (Feature 1)
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  
  const [itemForm, setItemForm] = useState({
    medicine_name: '',
    brand_name: '',
    strength: '',
    form: 'Tablet',
    stock_quantity: '',
    batch_number: '',
    expiry_date: '',
    reorder_level: '10',
    selling_price: ''
  });

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

  const fetchInventory = async () => {
    setLoadingInventory(true);
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      setInventoryItems(res.data);
    } catch (e) {
      console.log('Error fetching inventory', e);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    fetchMyPatients();
    fetchInventory();
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
  };

  const handlePatientClick = (patient) => {
    setSelectedPatient(patient);
    fetchPatientMedicines(patient.id);
  };

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

  // Inventory autocomplete search for Prescription Form
  const handleMedicineNameChange = async (index, val) => {
    const updated = [...medicinesList];
    updated[index].medicine_name = val;
    updated[index].availability_source = 'buy_outside'; // Default
    
    if (val.trim().length > 1) {
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(val)}`);
        updated[index].suggestions = res.data;
        updated[index].showSuggestions = true;
      } catch (e) {
        updated[index].suggestions = [];
      }
    } else {
      updated[index].suggestions = [];
      updated[index].showSuggestions = false;
    }
    setMedicinesList(updated);
  };

  const selectInventorySuggestion = (index, invItem) => {
    const updated = [...medicinesList];
    updated[index].medicine_name = `${invItem.medicine_name} (${invItem.strength})`;
    updated[index].availability_source = 'clinic_pharmacy';
    updated[index].showSuggestions = false;
    updated[index].suggestions = [];
    setMedicinesList(updated);
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
        custom_time: '08:00',
        availability_source: 'buy_outside',
        suggestions: [],
        showSuggestions: false
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
        custom_times: med.custom_time ? [med.custom_time] : [],
        availability_source: med.availability_source || 'buy_outside'
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
          custom_time: '08:00',
          availability_source: 'buy_outside',
          suggestions: [],
          showSuggestions: false
        }
      ]);
      fetchInventory(); // refresh inventory stock
    } catch (e) {
      alert('Failed to prescribe: ' + (e.response?.data?.message || e.message));
    } finally {
      setCreating(false);
    }
  };

  // Inventory Actions
  const handleSaveInventoryItem = async () => {
    if (!itemForm.medicine_name || !itemForm.stock_quantity) {
      return alert('Please enter medicine name and stock quantity');
    }

    try {
      const payload = {
        medicine_name: itemForm.medicine_name,
        brand_name: itemForm.brand_name,
        strength: itemForm.strength,
        form: itemForm.form,
        stock_quantity: parseInt(itemForm.stock_quantity),
        batch_number: itemForm.batch_number,
        expiry_date: itemForm.expiry_date || null,
        reorder_level: parseInt(itemForm.reorder_level || '10'),
        selling_price: itemForm.selling_price ? parseFloat(itemForm.selling_price) : null
      };

      if (editingInventoryItem) {
        await axios.put(`${API_URL}/inventory/${editingInventoryItem.id}`, payload);
        alert('Stock item updated successfully!');
      } else {
        await axios.post(`${API_URL}/inventory`, payload);
        alert('Item added to pharmacy inventory!');
      }
      setInventoryModalVisible(false);
      setEditingInventoryItem(null);
      resetItemForm();
      fetchInventory();
    } catch (e) {
      alert('Failed to save item: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleRestock = async (item, amount = 10) => {
    try {
      await axios.put(`${API_URL}/inventory/${item.id}`, {
        stock_quantity: item.stock_quantity + amount
      });
      fetchInventory();
    } catch (e) {
      alert('Failed to restock item');
    }
  };

  const handleDeleteInventoryItem = async (id) => {
    try {
      await axios.delete(`${API_URL}/inventory/${id}`);
      fetchInventory();
    } catch (e) {
      alert('Failed to delete item');
    }
  };

  const resetItemForm = () => {
    setItemForm({
      medicine_name: '',
      brand_name: '',
      strength: '',
      form: 'Tablet',
      stock_quantity: '',
      batch_number: '',
      expiry_date: '',
      reorder_level: '10',
      selling_price: ''
    });
  };

  const openEditInventoryModal = (item) => {
    setEditingInventoryItem(item);
    setItemForm({
      medicine_name: item.medicine_name || '',
      brand_name: item.brand_name || '',
      strength: item.strength || '',
      form: item.form || 'Tablet',
      stock_quantity: item.stock_quantity ? item.stock_quantity.toString() : '0',
      batch_number: item.batch_number || '',
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
      reorder_level: item.reorder_level ? item.reorder_level.toString() : '10',
      selling_price: item.selling_price ? item.selling_price.toString() : ''
    });
    setInventoryModalVisible(true);
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
  };

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
  };

  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setPatientMedicines([]);
  };

  const filteredInventory = inventoryItems.filter(item => 
    item.medicine_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.brand_name && item.brand_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const lowStockCount = inventoryItems.filter(i => i.stock_quantity <= i.reorder_level).length;

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
          style={[styles.tab, tab === 'create' && styles.activeTab]}
          onPress={() => {setTab('create'); setSelectedPatient(null); setEditingMedicine(null);}}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.activeTabText]}>{t('New Prescription')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, tab === 'inventory' && styles.activeTab]}
          onPress={() => {setTab('inventory'); setSelectedPatient(null);}}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.tabText, tab === 'inventory' && styles.activeTabText]}>{t('Pharmacy Stock')}</Text>
            {lowStockCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{lowStockCount}</Text>
              </View>
            )}
          </View>
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
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
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
                       placeholder="e.g. Paracetamol 500mg" 
                       placeholderTextColor="#64748B"
                       value={med.medicine_name}
                       onChangeText={(val) => handleMedicineNameChange(index, val)}
                     />

                     {/* Autocomplete Dropdown */}
                     {med.showSuggestions && med.suggestions.length > 0 && (
                       <View style={styles.suggestionsDropdown}>
                         <Text style={styles.suggestionHeader}>Clinic Pharmacy Stock Items:</Text>
                         {med.suggestions.map((invItem) => (
                           <TouchableOpacity 
                             key={invItem.id} 
                             style={styles.suggestionItem}
                             onPress={() => selectInventorySuggestion(index, invItem)}
                           >
                             <View style={{ flex: 1 }}>
                               <Text style={styles.suggestionName}>{invItem.medicine_name} ({invItem.strength})</Text>
                               <Text style={styles.suggestionSub}>{invItem.brand_name || invItem.form} • Qty: {invItem.stock_quantity}</Text>
                             </View>
                             <View style={styles.inStockBadge}>
                               <Text style={styles.inStockBadgeText}>In Stock – Clinic</Text>
                             </View>
                           </TouchableOpacity>
                         ))}
                       </View>
                     )}

                     {/* Availability Badge */}
                     <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                       <TouchableOpacity 
                         style={[
                           styles.sourceBadge, 
                           med.availability_source === 'clinic_pharmacy' ? styles.sourceClinicActive : styles.sourceInactive
                         ]}
                         onPress={() => updateMedicineRow(index, 'availability_source', 'clinic_pharmacy')}
                       >
                         <Text style={[styles.sourceText, med.availability_source === 'clinic_pharmacy' && styles.sourceClinicText]}>
                           ✓ In Stock – Clinic Pharmacy
                         </Text>
                       </TouchableOpacity>
                       <TouchableOpacity 
                         style={[
                           styles.sourceBadge, 
                           med.availability_source === 'buy_outside' ? styles.sourceOutsideActive : styles.sourceInactive
                         ]}
                         onPress={() => updateMedicineRow(index, 'availability_source', 'buy_outside')}
                       >
                         <Text style={[styles.sourceText, med.availability_source === 'buy_outside' && styles.sourceOutsideText]}>
                           🛒 Buy Outside
                         </Text>
                       </TouchableOpacity>
                     </View>

                     <Text style={styles.label}>{t('Dosage')}</Text>
                     <TextInput 
                       style={styles.input} 
                       placeholder="e.g. 500mg / 1 tablet" 
                       placeholderTextColor="#64748B"
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
                            placeholderTextColor="#64748B"
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
                            placeholderTextColor="#64748B"
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
        ) : tab === 'inventory' ? (
          <View style={{ flex: 1 }}>
            {/* Inventory Controls */}
            <View style={styles.inventoryHeaderCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.h3}>Clinic Pharmacy Stock</Text>
                <TouchableOpacity 
                  style={styles.addStockBtn} 
                  onPress={() => { resetItemForm(); setEditingInventoryItem(null); setInventoryModalVisible(true); }}
                >
                  <Text style={styles.addStockBtnText}>+ Add Stock</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Search stock by name or brand..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {loadingInventory ? (
              <ActivityIndicator size="large" color="#1A9988" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={filteredInventory}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                  const isLow = item.stock_quantity <= item.reorder_level;
                  return (
                    <View style={[styles.inventoryCard, isLow && styles.inventoryCardLow]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.invName}>{item.medicine_name}</Text>
                            {isLow && (
                              <View style={styles.lowBadge}>
                                <Text style={styles.lowBadgeText}>LOW STOCK</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.invSub}>{item.brand_name ? `${item.brand_name} • ` : ''}{item.strength} • {item.form}</Text>
                          <Text style={styles.invDetails}>Batch: {item.batch_number || 'N/A'} • Exp: {item.expiry_date ? item.expiry_date.split('T')[0] : 'N/A'}</Text>
                          {item.selling_price && <Text style={styles.invPrice}>Price: ₹{item.selling_price}</Text>}
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={[styles.stockQty, isLow && { color: '#DC2626' }]}>
                            {item.stock_quantity} <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>left</Text>
                          </Text>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity style={styles.actionBtnSmall} onPress={() => handleRestock(item, 10)}>
                              <Text style={styles.actionBtnText}>+10 Stock</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtnEdit} onPress={() => openEditInventoryModal(item)}>
                              <Text style={styles.actionBtnEditText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtnDelete} onPress={() => handleDeleteInventoryItem(item.id)}>
                              <Text style={styles.actionBtnDeleteText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyText}>No inventory items added yet.</Text>}
              />
            )}
          </View>
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
                <TextInput style={styles.input} placeholderTextColor="#64748B" value={editingMedicine.medicine_name} onChangeText={(val) => setEditingMedicine({...editingMedicine, medicine_name: val})} />

                <Text style={styles.label}>{t('Dosage')}</Text>
                <TextInput style={styles.input} placeholderTextColor="#64748B" value={editingMedicine.dosage} onChangeText={(val) => setEditingMedicine({...editingMedicine, dosage: val})} />

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
                     <TextInput style={styles.input} placeholderTextColor="#64748B" value={editingMedicine.duration_days} onChangeText={(val) => setEditingMedicine({...editingMedicine, duration_days: val})} keyboardType="numeric" />
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
                     <TextInput style={styles.input} placeholderTextColor="#64748B" value={editingMedicine.custom_times} onChangeText={(val) => setEditingMedicine({...editingMedicine, custom_times: val})} />
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

                          {/* Show Medicine Streak Button */}
                          <TouchableOpacity 
                            style={styles.showHistoryBtn}
                            onPress={() => setShowCalendarMed(item)}
                          >
                            <Text style={styles.showHistoryBtnText}>📅 Show Medicine History / Streak</Text>
                          </TouchableOpacity>
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
                    placeholderTextColor="#64748B"
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

      {/* Add / Edit Inventory Modal */}
      <Modal visible={inventoryModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', width: '100%', alignItems: 'center' }}>
            <View style={styles.inventoryModalCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
                <Text style={styles.modalTitle}>{editingInventoryItem ? 'Edit Pharmacy Item' : 'Add Stock Item'}</Text>
                <TouchableOpacity onPress={() => setInventoryModalVisible(false)} style={styles.closeBtnIcon}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Medicine Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Amoxicillin" placeholderTextColor="#64748B" value={itemForm.medicine_name} onChangeText={(val) => setItemForm({ ...itemForm, medicine_name: val })} />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Brand Name</Text>
                  <TextInput style={styles.input} placeholder="e.g. Cipla / Sun" placeholderTextColor="#64748B" value={itemForm.brand_name} onChangeText={(val) => setItemForm({ ...itemForm, brand_name: val })} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Strength</Text>
                  <TextInput style={styles.input} placeholder="e.g. 500mg" placeholderTextColor="#64748B" value={itemForm.strength} onChangeText={(val) => setItemForm({ ...itemForm, strength: val })} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Form</Text>
                  <View style={styles.pickerContainer}>
                    <Picker selectedValue={itemForm.form} onValueChange={(val) => setItemForm({ ...itemForm, form: val })}>
                      <Picker.Item label="Tablet" value="Tablet" />
                      <Picker.Item label="Capsule" value="Capsule" />
                      <Picker.Item label="Syrup" value="Syrup" />
                      <Picker.Item label="Injection" value="Injection" />
                      <Picker.Item label="Ointment" value="Ointment" />
                      <Picker.Item label="Drops" value="Drops" />
                    </Picker>
                  </View>
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Stock Qty *</Text>
                  <TextInput style={styles.input} placeholder="e.g. 100" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.stock_quantity} onChangeText={(val) => setItemForm({ ...itemForm, stock_quantity: val })} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Batch Number</Text>
                  <TextInput style={styles.input} placeholder="e.g. B-9982" placeholderTextColor="#64748B" value={itemForm.batch_number} onChangeText={(val) => setItemForm({ ...itemForm, batch_number: val })} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
                  <TextInput style={styles.input} placeholder="2027-12-31" placeholderTextColor="#64748B" value={itemForm.expiry_date} onChangeText={(val) => setItemForm({ ...itemForm, expiry_date: val })} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Reorder Warning Level</Text>
                  <TextInput style={styles.input} placeholder="10" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.reorder_level} onChangeText={(val) => setItemForm({ ...itemForm, reorder_level: val })} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Selling Price (₹)</Text>
                  <TextInput style={styles.input} placeholder="45.00" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.selling_price} onChangeText={(val) => setItemForm({ ...itemForm, selling_price: val })} />
                </View>
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveInventoryItem}>
                <Text style={styles.primaryButtonText}>Save Stock Item</Text>
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
    marginBottom: 8,
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
    marginTop: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  activeTab: { backgroundColor: '#E6F4F1' },
  tabText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, fontWeight: '600' },
  activeTabText: { color: '#1A9988' },
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
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
    color: COLORS.text,
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
    width: '100%',
  },
  primaryButtonText: { ...TYPOGRAPHY.button },

  // Inventory Styles
  inventoryHeaderCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  addStockBtn: {
    backgroundColor: '#1A9988',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addStockBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  inventoryCard: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inventoryCardLow: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  invName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  invSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  invDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  invPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  stockQty: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
  },
  lowBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '800',
  },
  actionBtnSmall: {
    backgroundColor: '#E6F4F1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionBtnText: {
    color: '#1A9988',
    fontWeight: '700',
    fontSize: 11,
  },
  actionBtnEdit: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionBtnEditText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 11,
  },
  actionBtnDelete: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionBtnDeleteText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 11,
  },

  // Autocomplete Suggestions
  suggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1A9988',
    marginTop: -12,
    marginBottom: 16,
    padding: 8,
    ...SHADOWS.medium,
  },
  suggestionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A9988',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  suggestionSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  inStockBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inStockBadgeText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '700',
  },

  sourceBadge: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  sourceInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: COLORS.border,
  },
  sourceClinicActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  sourceOutsideActive: {
    backgroundColor: '#FFEDD5',
    borderColor: '#F97316',
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  sourceClinicText: {
    color: '#047857',
  },
  sourceOutsideText: {
    color: '#C2410C',
  },

  // History & Patient Card Styles
  showHistoryBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  showHistoryBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  activeBadge: {
    backgroundColor: '#E8F0FE',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    color: '#1A73E8',
    fontWeight: '700',
  },
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

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  inventoryModalCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    ...SHADOWS.large
  },
  modalTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary },
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
