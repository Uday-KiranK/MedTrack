import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ScrollView, ActivityIndicator, Image, Modal, KeyboardAvoidingView, Platform } from 'react-native';
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

  const DOSAGE_PRESETS = {
    Tablet: ['1 Tablet', '2 Tablets', '0.5 Tablet'],
    Capsule: ['1 Capsule', '2 Capsules'],
    Syrup: ['5ml (1 tsp)', '10ml (2 tsp)', '15ml (1 tbsp)', '2.5ml (1/2 tsp)'],
    Injection: ['1 Ampoule', '1 Vial', '2ml'],
    Ointment: ['Apply Thin Layer', 'Pea-sized Amount'],
    Drops: ['2 Drops', '3 Drops', '5 Drops', '10 Drops']
  };

  const SCHEDULE_PRESETS = [
    'Once Daily',
    'Twice Daily',
    '3 Times Daily',
    '4 Times Daily',
    'Alternate Days (Every 2 days)',
    'Every 3 Days',
    'Weekly',
    'Monthly',
    'As Needed (PRN)',
    'Custom Schedule'
  ];

  const MEAL_SLOT_OPTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Bedtime'];

  // Start Date Option State
  const [startDateOption, setStartDateOption] = useState('Today'); // 'Today' | 'Tomorrow' | 'Custom'
  const [customStartDate, setCustomStartDate] = useState('');

  // Prescription creation state
  const [patientId, setPatientId] = useState('');
  const [medicinesList, setMedicinesList] = useState([
    {
      medicine_name: '',
      medicine_form: 'Tablet',
      dosage: '1 Tablet',
      frequency_preset: 'Once Daily',
      schedule_type: 'daily',
      meal_slots: ['Breakfast'],
      food_instruction: 'After Food',
      custom_times: ['08:00'],
      duration_days: '7',
      custom_schedule_text: '',
      custom_duration_text: '',
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

  // Pharmacy Inventory State
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
      const data = Array.isArray(res.data) ? res.data : [];
      setMyPatients(data);
      if (data.length > 0 && !patientId) {
         setPatientId(data[0].id.toString());
      }
    } catch (e) {
      console.log('Error fetching patients', e);
      setMyPatients([]);
    } finally {
      setLoadingPatients(false);
    }
  };

  const fetchInventory = async () => {
    setLoadingInventory(true);
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.items) ? res.data.items : []);
      setInventoryItems(data);
    } catch (e) {
      console.log('Error fetching inventory', e);
      setInventoryItems([]);
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
      const data = Array.isArray(res.data) ? res.data : [];
      setPatientMedicines(data);
    } catch (error) {
      console.log("Failed to fetch prescriptions", error);
      setPatientMedicines([]);
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

  const handleMedicineNameChange = async (index, val) => {
    const updated = [...medicinesList];
    updated[index].medicine_name = val;
    updated[index].availability_source = 'buy_outside';
    
    if (val.trim().length > 1) {
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(val)}`);
        const items = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.items) ? res.data.items : []);
        updated[index].suggestions = items;
        updated[index].showSuggestions = items.length > 0;
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
    const form = invItem.form || 'Tablet';
    updated[index].medicine_name = `${invItem.medicine_name} ${invItem.strength ? '(' + invItem.strength + ')' : ''}`;
    updated[index].medicine_form = form;
    const defaultDosages = DOSAGE_PRESETS[form] || DOSAGE_PRESETS['Tablet'];
    updated[index].dosage = defaultDosages[0];
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
        medicine_form: 'Tablet',
        dosage: '1 Tablet',
        frequency_preset: 'Once Daily',
        schedule_type: 'daily',
        meal_slots: ['Breakfast'],
        food_instruction: 'After Food',
        custom_times: ['08:00'],
        duration_days: '7',
        custom_schedule_text: '',
        custom_duration_text: '',
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

  const getMaxSlotsForFrequency = (freq) => {
    if (freq === 'Once Daily') return 1;
    if (freq === 'Twice Daily') return 2;
    if (freq === '3 Times Daily') return 3;
    if (freq === '4 Times Daily') return 4;
    return 1;
  };

  const getDefaultSlotsForFrequency = (freq) => {
    if (freq === 'Once Daily') return ['Breakfast'];
    if (freq === 'Twice Daily') return ['Breakfast', 'Dinner'];
    if (freq === '3 Times Daily') return ['Breakfast', 'Lunch', 'Dinner'];
    if (freq === '4 Times Daily') return ['Breakfast', 'Lunch', 'Dinner', 'Bedtime'];
    return ['Breakfast'];
  };

  const getDefaultTimesForFrequency = (freq) => {
    if (freq === 'Once Daily') return ['08:00'];
    if (freq === 'Twice Daily') return ['08:00', '20:00'];
    if (freq === '3 Times Daily') return ['08:00', '14:00', '20:00'];
    if (freq === '4 Times Daily') return ['08:00', '12:00', '18:00', '22:00'];
    return ['08:00'];
  };

  const updateMedicineRow = (index, key, val) => {
    const updated = [...medicinesList];
    updated[index][key] = val;

    if (key === 'medicine_form') {
      const defaultDosages = DOSAGE_PRESETS[val] || DOSAGE_PRESETS['Tablet'];
      updated[index].dosage = defaultDosages[0];
    } else if (key === 'frequency_preset') {
      const maxSlots = getMaxSlotsForFrequency(val);
      updated[index].meal_slots = getDefaultSlotsForFrequency(val);
      updated[index].custom_times = getDefaultTimesForFrequency(val);

      if (val === 'Weekly') {
        updated[index].schedule_type = 'weekly';
      } else if (val === 'Monthly') {
        updated[index].schedule_type = 'monthly';
      } else if (val === 'Alternate Days (Every 2 days)') {
        updated[index].schedule_type = 'alternate_days';
      } else if (val === 'Every 3 Days') {
        updated[index].schedule_type = 'every_3_days';
      } else {
        updated[index].schedule_type = 'daily';
      }
    } else if (key === 'food_instruction') {
      if (val === 'Empty Stomach') {
        updated[index].meal_slots = ['Breakfast'];
        updated[index].custom_times = ['07:30'];
      }
    }

    setMedicinesList(updated);
  };

  const updateCustomTimeAtIndex = (medIndex, timeIndex, val) => {
    const updated = [...medicinesList];
    const times = [...(updated[medIndex].custom_times || ['08:00'])];
    times[timeIndex] = val;
    updated[medIndex].custom_times = times;
    setMedicinesList(updated);
  };

  const toggleMealSlot = (index, slotName) => {
    const updated = [...medicinesList];
    const freq = updated[index].frequency_preset || 'Once Daily';
    const maxSlots = getMaxSlotsForFrequency(freq);
    let currentSlots = updated[index].meal_slots || [];

    if (currentSlots.includes(slotName)) {
      currentSlots = currentSlots.filter(s => s !== slotName);
    } else {
      if (currentSlots.length >= maxSlots) {
        currentSlots = [...currentSlots.slice(1), slotName];
      } else {
        currentSlots = [...currentSlots, slotName];
      }
    }
    updated[index].meal_slots = currentSlots;
    setMedicinesList(updated);
  };

  const computeComputedStartDate = () => {
    const d = new Date();
    if (startDateOption === 'Tomorrow') {
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } else if (startDateOption === 'Custom' && customStartDate.trim()) {
      return customStartDate.trim();
    }
    return d.toISOString().split('T')[0];
  };

  const handleCreatePrescription = async () => {
    if (!patientId) {
      alert("Please select a Patient");
      return;
    }

    for (let i = 0; i < medicinesList.length; i++) {
      const med = medicinesList[i];
      if (!med.medicine_name || !med.dosage) {
        alert(`Please fill Medicine Name and Dosage for Medicine #${i + 1}`);
        return;
      }
    }

    const startDateStr = computeComputedStartDate();

    setCreating(true);
    try {
      const payloadMedicines = medicinesList.map(med => ({
        medicine_name: med.medicine_name,
        medicine_form: med.medicine_form || 'Tablet',
        dosage: med.dosage,
        schedule_type: med.schedule_type || 'daily',
        duration_days: parseInt(med.duration_days || '7', 10),
        food_instruction: med.food_instruction || 'After Food',
        custom_times: med.food_instruction === 'Specific Fixed Time' ? (med.custom_times || ['08:00']) : (med.food_instruction === 'Empty Stomach' ? ['07:30'] : []),
        meal_slots: med.meal_slots || [],
        custom_schedule_text: med.frequency_preset === 'Custom Schedule' ? med.custom_schedule_text : med.frequency_preset,
        custom_duration_text: med.duration_days === 'Custom' ? med.custom_duration_text : null,
        availability_source: med.availability_source || 'buy_outside',
        start_date: startDateStr
      }));

      await axios.post(`${API_URL}/prescriptions`, {
        patientId: parseInt(patientId),
        medicines: payloadMedicines,
        startDate: startDateStr
      });

      alert('Prescription created successfully!');
      setMedicinesList([
        {
          medicine_name: '',
          medicine_form: 'Tablet',
          dosage: '1 Tablet',
          frequency_preset: 'Once Daily',
          schedule_type: 'daily',
          meal_slots: ['Breakfast'],
          food_instruction: 'After Food',
          custom_times: ['08:00'],
          duration_days: '7',
          custom_schedule_text: '',
          custom_duration_text: '',
          availability_source: 'buy_outside',
          suggestions: [],
          showSuggestions: false
        }
      ]);
      fetchInventory();
    } catch (e) {
      alert('Failed to prescribe: ' + (e.response?.data?.message || e.message));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveInventoryItem = async () => {
    if (!itemForm.medicine_name || !itemForm.stock_quantity) {
      return alert('Please enter medicine name and stock quantity');
    }

    try {
      const payload = {
        medicineName: itemForm.medicine_name,
        medicine_name: itemForm.medicine_name,
        brandName: itemForm.brand_name,
        brand_name: itemForm.brand_name,
        strength: itemForm.strength,
        form: itemForm.form,
        stockQuantity: parseInt(itemForm.stock_quantity || '0', 10),
        stock_quantity: parseInt(itemForm.stock_quantity || '0', 10),
        batchNumber: itemForm.batch_number,
        batch_number: itemForm.batch_number,
        expiryDate: itemForm.expiry_date || null,
        expiry_date: itemForm.expiry_date || null,
        reorderLevel: parseInt(itemForm.reorder_level || '10', 10),
        reorder_level: parseInt(itemForm.reorder_level || '10', 10),
        sellingPrice: itemForm.selling_price ? parseFloat(itemForm.selling_price) : null,
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

  const startEdit = (med) => {
    setEditingMedicine({
      id: med.id,
      medicine_name: med.medicine_name || '',
      medicine_form: med.medicine_form || 'Tablet',
      dosage: med.dosage || '1 Tablet',
      schedule_type: med.schedule_type || 'daily',
      duration_days: med.duration_days?.toString() || '7',
      food_instruction: med.food_instruction || 'After Food',
      meal_slots: med.meal_slots || ['Breakfast'],
      custom_times: med.custom_times && med.custom_times.length > 0 ? med.custom_times : ['08:00'],
      availability_source: med.availability_source || 'buy_outside'
    });
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {
        medicine_name: editingMedicine.medicine_name,
        medicine_form: editingMedicine.medicine_form,
        dosage: editingMedicine.dosage,
        schedule_type: editingMedicine.schedule_type,
        duration_days: parseInt(editingMedicine.duration_days || '7', 10),
        food_instruction: editingMedicine.food_instruction,
        meal_slots: editingMedicine.meal_slots || [],
        custom_times: editingMedicine.food_instruction === 'Specific Fixed Time' ? editingMedicine.custom_times : [],
        availability_source: editingMedicine.availability_source || 'buy_outside'
      };
      
      await axios.put(`${API_URL}/prescriptions/medicine/${editingMedicine.id}`, payload);
      alert('Prescription updated successfully!');
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

  const safeInventory = Array.isArray(inventoryItems) ? inventoryItems : [];
  const safeSearchQuery = (searchQuery || '').toLowerCase();
  
  const filteredInventory = safeInventory.filter(item => {
    if (!item) return false;
    const nameMatch = item.medicine_name ? item.medicine_name.toLowerCase().includes(safeSearchQuery) : false;
    const brandMatch = item.brand_name ? item.brand_name.toLowerCase().includes(safeSearchQuery) : false;
    return nameMatch || brandMatch;
  });

  const lowStockCount = safeInventory.filter(i => i && (i.stock_quantity ?? 0) <= (i.reorder_level ?? 10)).length;

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
      <View style={styles.tabWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.tabContainer}
        >
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.content}>
          {tab === 'create' ? (
            <ScrollView contentContainerStyle={{ paddingBottom: 320 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true} showsVerticalScrollIndicator={true}>
            <View style={styles.formCard}>
               <Text style={styles.sectionTitle}>{t('New Prescription')}</Text>
               
               <Text style={styles.label}>{t('Select Patient')}</Text>
               <View style={styles.pickerContainer}>
                 <Picker
                   selectedValue={patientId}
                   onValueChange={(itemValue) => setPatientId(itemValue)}
                   style={styles.pickerStyle}
                   dropdownIconColor="#0F172A"
                 >
                   <Picker.Item label={t("-- Select Patient --")} value="" color="#0F172A" style={styles.pickerItemStyle} />
                   {myPatients.map(p => (
                     <Picker.Item key={p.id} label={`${p.name} (${p.phone})`} value={p.id.toString()} color="#0F172A" style={styles.pickerItemStyle} />
                   ))}
                 </Picker>
               </View>

               {/* Start Date Option */}
               <View style={{ marginBottom: 16, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' }}>
                 <Text style={styles.label}>🗓️ When to start medication?</Text>
                 <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                   {['Today', 'Tomorrow', 'Custom'].map((opt) => (
                     <TouchableOpacity
                       key={opt}
                       style={[styles.chip, startDateOption === opt && styles.chipActive]}
                       onPress={() => setStartDateOption(opt)}
                     >
                       <Text style={[styles.chipText, startDateOption === opt && styles.chipActiveText]}>
                         {opt === 'Today' ? '☀️ Starts Today' : opt === 'Tomorrow' ? '🌅 Starts Tomorrow' : '📅 Custom Date'}
                       </Text>
                     </TouchableOpacity>
                   ))}
                 </View>
                 {startDateOption === 'Custom' && (
                   <TextInput
                     style={[styles.input, { marginTop: 10, color: '#0F172A' }]}
                     placeholder="YYYY-MM-DD (e.g. 2026-10-01)"
                     placeholderTextColor="#64748B"
                     value={customStartDate}
                     onChangeText={setCustomStartDate}
                   />
                 )}
               </View>

               {medicinesList.map((med, index) => {
                 const requiredDoseCount = getMaxSlotsForFrequency(med.frequency_preset);
                 return (
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
                       style={[styles.input, { color: '#0F172A' }]} 
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

                      <View style={styles.row}>
                        <View style={styles.col}>
                          <Text style={styles.label}>{t('Medicine Form')}</Text>
                          <View style={styles.pickerContainer}>
                            <Picker 
                              selectedValue={med.medicine_form || 'Tablet'} 
                              onValueChange={(val) => updateMedicineRow(index, 'medicine_form', val)}
                              style={styles.pickerStyle}
                              dropdownIconColor="#0F172A"
                            >
                              <Picker.Item label="Tablet 💊" value="Tablet" color="#0F172A" style={styles.pickerItemStyle} />
                              <Picker.Item label="Capsule 💊" value="Capsule" color="#0F172A" style={styles.pickerItemStyle} />
                              <Picker.Item label="Syrup 🧪" value="Syrup" color="#0F172A" style={styles.pickerItemStyle} />
                              <Picker.Item label="Injection 💉" value="Injection" color="#0F172A" style={styles.pickerItemStyle} />
                              <Picker.Item label="Ointment 🧴" value="Ointment" color="#0F172A" style={styles.pickerItemStyle} />
                              <Picker.Item label="Drops 💧" value="Drops" color="#0F172A" style={styles.pickerItemStyle} />
                            </Picker>
                          </View>
                        </View>

                        <View style={styles.col}>
                          <Text style={styles.label}>{t('Frequency / Schedule')}</Text>
                          <View style={styles.pickerContainer}>
                            <Picker 
                              selectedValue={med.frequency_preset || 'Once Daily'} 
                              onValueChange={(val) => updateMedicineRow(index, 'frequency_preset', val)}
                              style={styles.pickerStyle}
                              dropdownIconColor="#0F172A"
                            >
                              {SCHEDULE_PRESETS.map((preset) => (
                                <Picker.Item key={preset} label={preset} value={preset} color="#0F172A" style={styles.pickerItemStyle} />
                              ))}
                            </Picker>
                          </View>
                        </View>
                      </View>

                      {med.frequency_preset === 'Custom Schedule' && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={styles.label}>{t('Specify Custom Schedule')}</Text>
                          <TextInput
                            style={[styles.input, { color: '#0F172A' }]}
                            placeholder="e.g. Every 2 weeks on Monday"
                            placeholderTextColor="#64748B"
                            value={med.custom_schedule_text}
                            onChangeText={(val) => updateMedicineRow(index, 'custom_schedule_text', val)}
                          />
                        </View>
                      )}

                      <Text style={styles.label}>{t('Dosage / Quantity per intake')}</Text>
                      <View style={styles.chipRow}>
                        {(DOSAGE_PRESETS[med.medicine_form || 'Tablet'] || DOSAGE_PRESETS['Tablet']).map((dOption) => {
                          const isActive = med.dosage === dOption;
                          return (
                            <TouchableOpacity
                              key={dOption}
                              style={[styles.chip, isActive && styles.chipActive]}
                              onPress={() => updateMedicineRow(index, 'dosage', dOption)}
                            >
                              <Text style={[styles.chipText, isActive && styles.chipActiveText]}>{dOption}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TextInput 
                        style={[styles.input, { marginTop: 6, color: '#0F172A' }]} 
                        placeholder="Or type custom dosage (e.g. 10ml, 2 tabs)"
                        placeholderTextColor="#64748B"
                        value={med.dosage}
                        onChangeText={(val) => updateMedicineRow(index, 'dosage', val)}
                      />

                      <View style={styles.row}>
                        <View style={styles.col}>
                           <Text style={styles.label}>{t('Duration Type')}</Text>
                           <View style={styles.pickerContainer}>
                             <Picker 
                               selectedValue={med.schedule_type} 
                               onValueChange={(val) => updateMedicineRow(index, 'schedule_type', val)}
                               style={styles.pickerStyle}
                               dropdownIconColor="#0F172A"
                             >
                               <Picker.Item label={t("Daily")} value="daily" color="#0F172A" style={styles.pickerItemStyle} />
                               <Picker.Item label={t("Weekly")} value="weekly" color="#0F172A" style={styles.pickerItemStyle} />
                               <Picker.Item label={t("Monthly")} value="monthly" color="#0F172A" style={styles.pickerItemStyle} />
                               <Picker.Item label={t("Alternate Days (Every 2 days)")} value="alternate_days" color="#0F172A" style={styles.pickerItemStyle} />
                               <Picker.Item label={t("Every 3 Days")} value="every_3_days" color="#0F172A" style={styles.pickerItemStyle} />
                             </Picker>
                           </View>
                        </View>
                        <View style={styles.col}>
                           <Text style={styles.label}>
                             {med.schedule_type === 'weekly' 
                               ? t('Weeks Count') 
                               : med.schedule_type === 'monthly' 
                                 ? t('Months Count') 
                                 : t('Days Count')}
                           </Text>
                           <TextInput 
                             style={[styles.input, { color: '#0F172A' }]} 
                             placeholderTextColor="#64748B"
                             value={med.duration_days}
                             onChangeText={(val) => updateMedicineRow(index, 'duration_days', val)}
                             keyboardType="numeric"
                           />
                        </View>
                      </View>

                      <View style={styles.row}>
                        <View style={styles.col}>
                           <Text style={styles.label}>{t('Food / Timing Instruction')}</Text>
                           <View style={styles.pickerContainer}>
                             <Picker 
                               selectedValue={med.food_instruction} 
                               onValueChange={(val) => updateMedicineRow(index, 'food_instruction', val)}
                               style={styles.pickerStyle}
                               dropdownIconColor="#0F172A"
                             >
                                <Picker.Item label={t("After Food")} value="After Food" color="#0F172A" style={styles.pickerItemStyle} />
                                <Picker.Item label={t("Before Food")} value="Before Food" color="#0F172A" style={styles.pickerItemStyle} />
                                <Picker.Item label={t("With Food")} value="With Food" color="#0F172A" style={styles.pickerItemStyle} />
                                <Picker.Item label={t("Empty Stomach")} value="Empty Stomach" color="#0F172A" style={styles.pickerItemStyle} />
                                <Picker.Item label={t("Specific Fixed Time")} value="Specific Fixed Time" color="#0F172A" style={styles.pickerItemStyle} />
                             </Picker>
                           </View>
                        </View>

                        {med.food_instruction === 'Specific Fixed Time' ? (
                          <View style={styles.col}>
                             <Text style={styles.label}>{t('Specific Fixed Timings')}</Text>
                             {Array.from({ length: requiredDoseCount }).map((_, tIdx) => (
                               <TextInput 
                                 key={tIdx}
                                 style={[styles.input, { marginBottom: 6, color: '#0F172A' }]} 
                                 placeholder={`Time #${tIdx + 1} (e.g. ${tIdx === 0 ? '08:00' : tIdx === 1 ? '20:00' : '14:00'})`} 
                                 placeholderTextColor="#64748B"
                                 value={(med.custom_times || [])[tIdx] || ''}
                                 onChangeText={(val) => updateCustomTimeAtIndex(index, tIdx, val)}
                               />
                             ))}
                          </View>
                        ) : null}
                      </View>

                      {med.food_instruction === 'Empty Stomach' && (
                        <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, marginVertical: 8, borderWidth: 1, borderColor: '#F59E0B' }}>
                          <Text style={{ color: '#92400E', fontSize: 13, fontWeight: '700' }}>
                            ⚡ Empty Stomach automatically defaults to 07:30 AM (Before Breakfast).
                          </Text>
                        </View>
                      )}

                      {med.food_instruction !== 'Specific Fixed Time' && med.food_instruction !== 'Empty Stomach' && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={styles.label}>
                            {t('Select Meal Timings')} ({med.meal_slots.length}/{requiredDoseCount} selected)
                          </Text>
                          <View style={styles.chipRow}>
                            {MEAL_SLOT_OPTIONS.map((slot) => {
                              const isSelected = (med.meal_slots || []).includes(slot);
                              return (
                                <TouchableOpacity
                                  key={slot}
                                  style={[styles.mealChip, isSelected && styles.mealChipActive]}
                                  onPress={() => toggleMealSlot(index, slot)}
                                >
                                  <Text style={[styles.mealChipText, isSelected && styles.mealChipActiveText]}>
                                    {isSelected ? '✓ ' : ''}{slot}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                  </View>
                )})}

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
                style={[styles.input, { marginBottom: 0, color: '#0F172A' }]}
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
           <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
             <View style={styles.formCard}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
                   <Text style={styles.sectionTitle}>{t('Edit Prescription Medicine')}</Text>
                   <TouchableOpacity onPress={() => setEditingMedicine(null)}>
                      <Text style={{color: COLORS.primary, fontWeight: '700'}}>{t('Cancel')}</Text>
                   </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('Medicine Name')}</Text>
                <TextInput style={[styles.input, { color: '#0F172A' }]} placeholderTextColor="#64748B" value={editingMedicine.medicine_name} onChangeText={(val) => setEditingMedicine({...editingMedicine, medicine_name: val})} />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>{t('Medicine Form')}</Text>
                    <View style={styles.pickerContainer}>
                      <Picker 
                        selectedValue={editingMedicine.medicine_form || 'Tablet'} 
                        onValueChange={(val) => setEditingMedicine({...editingMedicine, medicine_form: val})}
                        style={styles.pickerStyle}
                        dropdownIconColor="#0F172A"
                      >
                        <Picker.Item label="Tablet 💊" value="Tablet" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Capsule 💊" value="Capsule" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Syrup 🧪" value="Syrup" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Injection 💉" value="Injection" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Ointment 🧴" value="Ointment" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Drops 💧" value="Drops" color="#0F172A" style={styles.pickerItemStyle} />
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.label}>{t('Dosage')}</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholderTextColor="#64748B" value={editingMedicine.dosage} onChangeText={(val) => setEditingMedicine({...editingMedicine, dosage: val})} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                     <Text style={styles.label}>{t('Schedule Type')}</Text>
                     <View style={styles.pickerContainer}>
                       <Picker 
                         selectedValue={editingMedicine.schedule_type} 
                         onValueChange={(val) => setEditingMedicine({...editingMedicine, schedule_type: val})}
                         style={styles.pickerStyle}
                         dropdownIconColor="#0F172A"
                       >
                         <Picker.Item label={t("Daily")} value="daily" color="#0F172A" style={styles.pickerItemStyle} />
                         <Picker.Item label={t("Weekly")} value="weekly" color="#0F172A" style={styles.pickerItemStyle} />
                         <Picker.Item label={t("Monthly")} value="monthly" color="#0F172A" style={styles.pickerItemStyle} />
                         <Picker.Item label={t("Alternate Days (Every 2 days)")} value="alternate_days" color="#0F172A" style={styles.pickerItemStyle} />
                         <Picker.Item label={t("Every 3 Days")} value="every_3_days" color="#0F172A" style={styles.pickerItemStyle} />
                       </Picker>
                     </View>
                  </View>
                  <View style={styles.col}>
                     <Text style={styles.label}>
                       {editingMedicine.schedule_type === 'weekly' 
                          ? t('Weeks') 
                          : editingMedicine.schedule_type === 'monthly' 
                            ? t('Months') 
                            : t('Days')}
                     </Text>
                     <TextInput style={[styles.input, { color: '#0F172A' }]} placeholderTextColor="#64748B" value={editingMedicine.duration_days} onChangeText={(val) => setEditingMedicine({...editingMedicine, duration_days: val})} keyboardType="numeric" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                     <Text style={styles.label}>{t('Food Instructions')}</Text>
                     <View style={styles.pickerContainer}>
                       <Picker 
                         selectedValue={editingMedicine.food_instruction} 
                         onValueChange={(val) => setEditingMedicine({...editingMedicine, food_instruction: val})}
                         style={styles.pickerStyle}
                         dropdownIconColor="#0F172A"
                       >
                          <Picker.Item label={t("After Food")} value="After Food" color="#0F172A" style={styles.pickerItemStyle} />
                          <Picker.Item label={t("Before Food")} value="Before Food" color="#0F172A" style={styles.pickerItemStyle} />
                          <Picker.Item label={t("With Food")} value="With Food" color="#0F172A" style={styles.pickerItemStyle} />
                          <Picker.Item label={t("Empty Stomach")} value="Empty Stomach" color="#0F172A" style={styles.pickerItemStyle} />
                          <Picker.Item label={t("Specific Fixed Time")} value="Specific Fixed Time" color="#0F172A" style={styles.pickerItemStyle} />
                       </Picker>
                     </View>
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
                    style={[styles.input, { flex: 1, marginBottom: 0, color: '#0F172A' }]} 
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
    </KeyboardAvoidingView>

      {/* Add / Edit Inventory Modal */}
      <Modal visible={inventoryModalVisible} transparent={true} animationType="fade" onRequestClose={() => setInventoryModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInventoryModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalCenterWrapper}>
            <TouchableOpacity activeOpacity={1} style={styles.inventoryModalCard} onPress={() => {}}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.modalTitle}>{editingInventoryItem ? 'Edit Pharmacy Item' : 'Add Stock Item'}</Text>
                  <Text style={styles.modalSubTitle}>Clinic Pharmacy Inventory</Text>
                </View>
                <TouchableOpacity onPress={() => setInventoryModalVisible(false)} style={styles.closeBtnIcon}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={{ width: '100%' }} 
                contentContainerStyle={{ paddingBottom: 28 }}
                showsVerticalScrollIndicator={true} 
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
              >
                <Text style={styles.label}>Medicine Name *</Text>
                <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="e.g. Amoxicillin" placeholderTextColor="#64748B" value={itemForm.medicine_name} onChangeText={(val) => setItemForm({ ...itemForm, medicine_name: val })} />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Brand Name</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="e.g. Cipla / Sun" placeholderTextColor="#64748B" value={itemForm.brand_name} onChangeText={(val) => setItemForm({ ...itemForm, brand_name: val })} />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Strength</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="e.g. 500mg" placeholderTextColor="#64748B" value={itemForm.strength} onChangeText={(val) => setItemForm({ ...itemForm, strength: val })} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Form</Text>
                    <View style={styles.pickerContainer}>
                      <Picker 
                        selectedValue={itemForm.form} 
                        onValueChange={(val) => setItemForm({ ...itemForm, form: val })}
                        style={styles.pickerStyle}
                        dropdownIconColor="#0F172A"
                      >
                        <Picker.Item label="Tablet" value="Tablet" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Capsule" value="Capsule" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Syrup" value="Syrup" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Injection" value="Injection" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Ointment" value="Ointment" color="#0F172A" style={styles.pickerItemStyle} />
                        <Picker.Item label="Drops" value="Drops" color="#0F172A" style={styles.pickerItemStyle} />
                      </Picker>
                    </View>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Stock Qty *</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="e.g. 100" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.stock_quantity} onChangeText={(val) => setItemForm({ ...itemForm, stock_quantity: val })} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Batch Number</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="e.g. B-9982" placeholderTextColor="#64748B" value={itemForm.batch_number} onChangeText={(val) => setItemForm({ ...itemForm, batch_number: val })} />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Expiry (YYYY-MM-DD)</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="2027-12-31" placeholderTextColor="#64748B" value={itemForm.expiry_date} onChangeText={(val) => setItemForm({ ...itemForm, expiry_date: val })} />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Reorder Level</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="10" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.reorder_level} onChangeText={(val) => setItemForm({ ...itemForm, reorder_level: val })} />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Selling Price (₹)</Text>
                    <TextInput style={[styles.input, { color: '#0F172A' }]} placeholder="45.00" placeholderTextColor="#64748B" keyboardType="numeric" value={itemForm.selling_price} onChangeText={(val) => setItemForm({ ...itemForm, selling_price: val })} />
                  </View>
                </View>

                <TouchableOpacity style={styles.saveStockBtn} onPress={handleSaveInventoryItem}>
                  <Text style={styles.saveStockBtnText}>Save Stock Item</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
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
  greeting: { ...TYPOGRAPHY.h2, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 10,
  },
  logoutText: { color: COLORS.error, fontWeight: '600' },
  tabWrapper: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabContainer: {
    paddingHorizontal: 20,
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: 14,
    marginRight: 20,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { ...TYPOGRAPHY.button, color: COLORS.textSecondary },
  activeTabText: { color: COLORS.primary },
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  formCard: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 16,
    ...SHADOWS.medium,
  },
  sectionTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary, marginBottom: 16 },
  h3: { ...TYPOGRAPHY.h2, color: COLORS.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    marginBottom: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickerStyle: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    width: '100%',
  },
  pickerItemStyle: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  medicineFormCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  medHeaderTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FEE2E2', borderRadius: 6 },
  removeBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipActiveText: { color: '#FFFFFF', fontWeight: '700' },
  mealChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  mealChipActive: { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  mealChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  mealChipActiveText: { color: '#047857', fontWeight: '700' },
  addMedicineRowBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  addMedicineRowBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...TYPOGRAPHY.button },
  suggestionsDropdown: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    marginBottom: 12,
    padding: 8,
    ...SHADOWS.medium,
  },
  suggestionHeader: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  suggestionSub: { fontSize: 12, color: '#64748B' },
  inStockBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  inStockBadgeText: { color: '#047857', fontSize: 10, fontWeight: '700' },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sourceClinicActive: { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  sourceOutsideActive: { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' },
  sourceInactive: { backgroundColor: '#FAFAFA', borderColor: '#E5E7EB' },
  sourceText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  sourceClinicText: { color: '#047857', fontWeight: '700' },
  sourceOutsideText: { color: '#374151', fontWeight: '700' },
  inventoryHeaderCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    ...SHADOWS.small,
  },
  addStockBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addStockBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  inventoryCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  inventoryCardLow: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  invName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  invSub: { fontSize: 13, color: '#475569', marginTop: 2 },
  invDetails: { fontSize: 12, color: '#64748B', marginTop: 4 },
  invPrice: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  stockQty: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  lowBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lowBadgeText: { color: '#DC2626', fontSize: 10, fontWeight: '800' },
  actionBtnSmall: { backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  actionBtnText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  actionBtnEdit: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  actionBtnEditText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  actionBtnDelete: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  actionBtnDeleteText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textSecondary, ...TYPOGRAPHY.body },
  historyCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  medName: { ...TYPOGRAPHY.h2, color: COLORS.primary },
  medDetail: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 4 },
  completedBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  completedBadgeText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  activeBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  addPatientCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    ...SHADOWS.small,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCenterWrapper: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  inventoryModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
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
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalSubTitle: { fontSize: 12, color: '#64748B' },
  closeBtnIcon: { padding: 4 },
  closeBtnText: { fontSize: 18, color: '#64748B', fontWeight: 'bold' },
  saveStockBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveStockBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  showHistoryBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  showHistoryBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  calendarModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large
  },
  calendarTitle: { ...TYPOGRAPHY.h2, color: COLORS.primary },
  calendarSubTitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: 12, textAlign: 'center' },
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
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  dismissText: { ...TYPOGRAPHY.button },
  calendarStartCell: { borderColor: '#F59E0B', borderWidth: 2 },
  calendarStartCellText: { fontWeight: '800' },
  calendarStartStar: { position: 'absolute', bottom: -1, fontSize: 8, color: '#D97706' },
});
