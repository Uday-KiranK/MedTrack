import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const APPT_STATUS_COLORS = {
  scheduled: { bg: '#E0F2FE', text: '#0369A1', label: 'Scheduled' },
  checked_in: { bg: '#FEF3C7', text: '#B45309', label: 'Checked In' },
  in_consultation: { bg: '#EDE9FE', text: '#6D28D9', label: 'In Consult' },
  completed: { bg: '#DCFCE7', text: '#15803D', label: 'Completed' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
  no_show: { bg: '#FEE2E2', text: '#B91C1C', label: 'No Show' },
};

const todayISO = () => new Date().toISOString().split('T')[0];

export default function ReceptionDashboard() {
  const { t } = useTranslation();
  const { logout, userInfo, hasPermission } = useContext(AuthContext);
  const [tab, setTab] = useState('appointments'); // 'appointments' | 'schedules' | 'mappings' | 'patients'
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Core Lists
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [mappings, setMappings] = useState([]);

  // Appointment Filters
  const [dateFilter, setDateFilter] = useState(''); // '' = all upcoming/recent, or YYYY-MM-DD
  const [docFilter, setDocFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingAppts, setLoadingAppts] = useState(false);

  // Book Appointment Modal
  const [bookModalVisible, setBookModalVisible] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    doctorId: '',
    patientId: '',
    appointmentDate: todayISO(),
    slotTime: '',
    visitType: 'consultation',
    reason: '',
    bp: '',
    temp: '',
    pulse: '',
    weight: '',
  });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);

  // Doctor Schedule & Block State
  const [selectedScheduleDoctorId, setSelectedScheduleDoctorId] = useState('');
  const [doctorSchedules, setDoctorSchedules] = useState([]);
  const [doctorBlocks, setDoctorBlocks] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Schedule Edit Modal
  const [scheduleEditModalVisible, setScheduleEditModalVisible] = useState(false);
  const [editableSchedule, setEditableSchedule] = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Calendar Block Modal
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [blockForm, setBlockForm] = useState({
    blockDate: todayISO(),
    startTime: '13:00',
    endTime: '14:00',
    isFullDay: false,
    reason: '',
  });
  const [savingBlock, setSavingBlock] = useState(false);

  // Assign Mapping Modal
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignForm, setAssignForm] = useState({
    doctorId: '',
    patientId: '',
    exclusive: false,
    notes: '',
  });
  const [savingAssign, setSavingAssign] = useState(false);

  // Walk-in Patient Modal
  const [walkinModalVisible, setWalkinModalVisible] = useState(false);
  const [walkinForm, setWalkinForm] = useState({
    name: '',
    phone: '',
    email: '',
    doctorId: '',
    notes: '',
  });
  const [savingWalkin, setSavingWalkin] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');

  // Patient History Modal
  const [historyModalData, setHistoryModalData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Check-in / Vitals Update Modal
  const [vitalsModalAppt, setVitalsModalAppt] = useState(null);
  const [vitalsForm, setVitalsForm] = useState({ bp: '', temp: '', pulse: '', weight: '' });

  const fetchCoreDirectory = async () => {
    try {
      const [docRes, patRes, mapRes] = await Promise.all([
        axios.get(`${API_URL}/reception/doctors`),
        axios.get(`${API_URL}/reception/patients`, { params: patientSearch.trim() ? { q: patientSearch.trim() } : {} }),
        axios.get(`${API_URL}/reception/mappings`),
      ]);
      const docs = docRes.data?.doctors || [];
      setDoctors(docs);
      setPatients(patRes.data?.patients || []);
      setMappings(mapRes.data?.mappings || []);
      if (docs.length > 0) {
        if (!selectedScheduleDoctorId) setSelectedScheduleDoctorId(String(docs[0].id));
        if (!bookingForm.doctorId) setBookingForm((p) => ({ ...p, doctorId: String(docs[0].id) }));
        if (!assignForm.doctorId) setAssignForm((p) => ({ ...p, doctorId: String(docs[0].id) }));
      }
    } catch (e) {
      console.log('Fetch reception directory note:', e.message);
    }
  };

  const fetchAppointments = async () => {
    setLoadingAppts(true);
    try {
      const params = {};
      if (dateFilter.trim()) params.date = dateFilter.trim();
      if (docFilter !== 'all') params.doctorId = docFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await axios.get(`${API_URL}/reception/appointments`, { params });
      if (res.data?.success) setAppointments(res.data.appointments || []);
    } catch (e) {
      console.log('Fetch appointments note:', e.message);
    } finally {
      setLoadingAppts(false);
    }
  };

  const fetchSelectedDoctorSchedule = async (docId) => {
    if (!docId) return;
    setLoadingSchedule(true);
    try {
      const res = await axios.get(`${API_URL}/reception/doctors/${docId}/schedule`);
      if (res.data?.success) {
        setDoctorSchedules(res.data.schedules || []);
        setDoctorBlocks(res.data.blocks || []);
      }
    } catch (e) {
      console.log('Fetch doctor schedule note:', e.message);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const fetchBookingSlots = async (docId, dateStr) => {
    if (!docId || !dateStr || dateStr.length < 10) {
      setAvailableSlots([]);
      return;
    }
    setLoadingSlots(true);
    try {
      const res = await axios.get(`${API_URL}/reception/doctors/${docId}/slots`, { params: { date: dateStr } });
      setAvailableSlots(res.data?.slots || []);
    } catch (e) {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchCoreDirectory(), fetchAppointments()]);
    if (selectedScheduleDoctorId) {
      await fetchSelectedDoctorSchedule(selectedScheduleDoctorId);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [dateFilter, docFilter, statusFilter]);

  useEffect(() => {
    if (selectedScheduleDoctorId) {
      fetchSelectedDoctorSchedule(selectedScheduleDoctorId);
    }
  }, [selectedScheduleDoctorId]);

  useEffect(() => {
    if (bookModalVisible && bookingForm.doctorId && bookingForm.appointmentDate) {
      fetchBookingSlots(bookingForm.doctorId, bookingForm.appointmentDate);
    }
  }, [bookModalVisible, bookingForm.doctorId, bookingForm.appointmentDate]);

  const handleOpenBookingModal = () => {
    const defDoc = doctors[0] ? String(doctors[0].id) : '';
    const defPat = patients[0] ? String(patients[0].id) : '';
    setBookingForm({
      doctorId: bookingForm.doctorId || defDoc,
      patientId: bookingForm.patientId || defPat,
      appointmentDate: todayISO(),
      slotTime: '',
      visitType: 'consultation',
      reason: '',
      bp: '',
      temp: '',
      pulse: '',
      weight: '',
    });
    setBookModalVisible(true);
  };

  const handleConfirmBooking = async () => {
    if (!bookingForm.doctorId || !bookingForm.patientId || !bookingForm.appointmentDate || !bookingForm.slotTime) {
      return Alert.alert('Missing Details', 'Select Doctor, Patient, Date, and an available Time Slot.');
    }
    setBookingSaving(true);
    try {
      const vitals = {};
      if (bookingForm.bp) vitals.bp = bookingForm.bp;
      if (bookingForm.temp) vitals.temp = bookingForm.temp;
      if (bookingForm.pulse) vitals.pulse = bookingForm.pulse;
      if (bookingForm.weight) vitals.weight = bookingForm.weight;

      await axios.post(`${API_URL}/reception/appointments`, {
        doctorId: parseInt(bookingForm.doctorId, 10),
        patientId: parseInt(bookingForm.patientId, 10),
        appointmentDate: bookingForm.appointmentDate,
        slotTime: bookingForm.slotTime,
        visitType: bookingForm.visitType,
        reason: bookingForm.reason,
        vitals,
      });
      Alert.alert('Booked', 'Appointment booked and patient assigned to doctor.');
      setBookModalVisible(false);
      loadAll();
    } catch (e) {
      Alert.alert('Booking Conflict', e.response?.data?.message || 'Could not book appointment');
    } finally {
      setBookingSaving(false);
    }
  };

  const handleUpdateApptStatus = async (appt, nextStatus, extraVitals = null) => {
    try {
      await axios.patch(`${API_URL}/reception/appointments/${appt.id}`, {
        status: nextStatus,
        ...(extraVitals ? { vitals: extraVitals } : {}),
      });
      loadAll();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update appointment');
    }
  };

  const openCheckInModal = (appt) => {
    setVitalsModalAppt(appt);
    const v = appt.vitals || {};
    setVitalsForm({
      bp: v.bp || '',
      temp: v.temp || '',
      pulse: v.pulse || '',
      weight: v.weight || '',
    });
  };

  const handleConfirmCheckIn = async () => {
    if (!vitalsModalAppt) return;
    await handleUpdateApptStatus(vitalsModalAppt, 'checked_in', vitalsForm);
    setVitalsModalAppt(null);
  };

  const openEditScheduleModal = () => {
    const base = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const found = doctorSchedules.find((s) => s.day_of_week === dow);
      return found
        ? { ...found }
        : { day_of_week: dow, start_time: '09:00', end_time: '17:00', slot_duration_mins: 30, is_active: dow !== 0 };
    });
    setEditableSchedule(base);
    setScheduleEditModalVisible(true);
  };

  const handleSaveSchedule = async () => {
    if (!selectedScheduleDoctorId) return;
    setSavingSchedule(true);
    try {
      await axios.put(`${API_URL}/reception/doctors/${selectedScheduleDoctorId}/schedule`, {
        schedules: editableSchedule,
      });
      setScheduleEditModalVisible(false);
      fetchSelectedDoctorSchedule(selectedScheduleDoctorId);
      Alert.alert('Saved', 'Doctor weekly schedule updated.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to update schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const submitCalendarBlock = async (force = false, cancelConflicts = false) => {
    if (!selectedScheduleDoctorId || !blockForm.blockDate) {
      return Alert.alert('Missing Date', 'Enter block date (YYYY-MM-DD).');
    }
    setSavingBlock(true);
    try {
      await axios.post(`${API_URL}/reception/doctors/${selectedScheduleDoctorId}/blocks`, {
        ...blockForm,
        force,
        cancelConflicts,
      });
      setBlockModalVisible(false);
      fetchSelectedDoctorSchedule(selectedScheduleDoctorId);
      fetchAppointments();
      Alert.alert('Calendar Blocked', 'Doctor calendar updated.');
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.conflict) {
        const count = e.response.data.conflicts?.length || 1;
        Alert.alert(
          'Appointment Conflict',
          `This doctor has ${count} booked appointment(s) in this window. Force block and cancel those appointments?`,
          [
            { text: 'Go Back', style: 'cancel' },
            { text: 'Force Block & Cancel', style: 'destructive', onPress: () => submitCalendarBlock(true, true) },
          ]
        );
      } else {
        Alert.alert('Error', e.response?.data?.message || 'Failed to block calendar');
      }
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = (blockId) => {
    Alert.alert('Remove Block', 'Unblock this doctor calendar period?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/reception/blocks/${blockId}`);
            fetchSelectedDoctorSchedule(selectedScheduleDoctorId);
          } catch (e) {
            Alert.alert('Error', e.response?.data?.message || 'Could not remove block');
          }
        },
      },
    ]);
  };

  const handleAssignPatient = async () => {
    if (!assignForm.doctorId || !assignForm.patientId) {
      return Alert.alert('Select Both', 'Choose both Doctor and Patient.');
    }
    setSavingAssign(true);
    try {
      await axios.post(`${API_URL}/reception/mappings`, {
        doctorId: parseInt(assignForm.doctorId, 10),
        patientId: parseInt(assignForm.patientId, 10),
        exclusive: assignForm.exclusive,
        notes: assignForm.notes,
      });
      setAssignModalVisible(false);
      loadAll();
      Alert.alert('Assigned', 'Patient assigned to doctor.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to assign patient');
    } finally {
      setSavingAssign(false);
    }
  };

  const handleUnassign = (mapping) => {
    Alert.alert(
      'Unassign Patient',
      `Remove ${mapping.patient_name} from Dr. ${mapping.doctor_name}'s active list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unassign',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/reception/mappings/${mapping.doctor_id}/${mapping.patient_id}`);
              loadAll();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not unassign');
            }
          },
        },
      ]
    );
  };

  const handleRegisterWalkin = async () => {
    if (!walkinForm.name.trim() || !walkinForm.phone.trim()) {
      return Alert.alert('Missing Details', 'Patient name and phone are required.');
    }
    setSavingWalkin(true);
    try {
      await axios.post(`${API_URL}/reception/patients`, {
        name: walkinForm.name.trim(),
        phone: walkinForm.phone.trim(),
        email: walkinForm.email.trim() || undefined,
        doctorId: walkinForm.doctorId ? parseInt(walkinForm.doctorId, 10) : undefined,
        notes: walkinForm.notes.trim() || undefined,
      });
      setWalkinModalVisible(false);
      setWalkinForm({ name: '', phone: '', email: '', doctorId: '', notes: '' });
      loadAll();
      Alert.alert('Registered', 'Walk-in patient added to clinic directory.');
    } catch (e) {
      Alert.alert('Registration Error', e.response?.data?.message || 'Could not register patient');
    } finally {
      setSavingWalkin(false);
    }
  };

  const handleViewPatientHistory = async (patientId) => {
    setLoadingHistory(true);
    setHistoryModalData({ loading: true });
    try {
      const res = await axios.get(`${API_URL}/reception/patients/${patientId}/history`);
      if (res.data?.success) setHistoryModalData(res.data);
    } catch (e) {
      setHistoryModalData(null);
      Alert.alert('Error', e.response?.data?.message || 'Could not load patient history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectedDocObj = doctors.find((d) => String(d.id) === selectedScheduleDoctorId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Front Desk & Reception</Text>
          <Text style={styles.headerSub}>{userInfo?.name || 'Receptionist'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LanguageButton onPress={() => setLangModalVisible(true)} />
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>{t('Logout')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Tabs */}
      <View style={styles.tabWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'appointments' && styles.tabBtnActive]} onPress={() => setTab('appointments')}>
            <Text style={[styles.tabText, tab === 'appointments' && styles.tabTextActive]}>📅 Appointments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'schedules' && styles.tabBtnActive]} onPress={() => setTab('schedules')}>
            <Text style={[styles.tabText, tab === 'schedules' && styles.tabTextActive]}>🗓️ Doctor Schedules</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'mappings' && styles.tabBtnActive]} onPress={() => setTab('mappings')}>
            <Text style={[styles.tabText, tab === 'mappings' && styles.tabTextActive]}>🔗 Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'patients' && styles.tabBtnActive]} onPress={() => setTab('patients')}>
            <Text style={[styles.tabText, tab === 'patients' && styles.tabTextActive]}>👥 Patients & History</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: APPOINTMENTS */}
      {tab === 'appointments' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <View style={styles.toolbarRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Date filter (YYYY-MM-DD or blank)"
              placeholderTextColor="#64748B"
              value={dateFilter}
              onChangeText={setDateFilter}
            />
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setDateFilter(dateFilter === todayISO() ? '' : todayISO())}>
              <Text style={styles.secondaryBtnText}>{dateFilter === todayISO() ? 'All Dates' : 'Today'}</Text>
            </TouchableOpacity>
            {hasPermission('manage_appointments') && (
              <TouchableOpacity style={styles.addBtn} onPress={handleOpenBookingModal}>
                <Text style={styles.addBtnText}>+ Book</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
            <TouchableOpacity style={[styles.filterPill, docFilter === 'all' && styles.filterPillActive]} onPress={() => setDocFilter('all')}>
              <Text style={[styles.filterPillText, docFilter === 'all' && styles.filterPillTextActive]}>All Doctors</Text>
            </TouchableOpacity>
            {doctors.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.filterPill, docFilter === String(d.id) && styles.filterPillActive]}
                onPress={() => setDocFilter(String(d.id))}
              >
                <Text style={[styles.filterPillText, docFilter === String(d.id) && styles.filterPillTextActive]}>
                  Dr. {d.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all', label: 'All Status' },
              { key: 'scheduled', label: 'Scheduled' },
              { key: 'checked_in', label: 'Checked In' },
              { key: 'in_consultation', label: 'In Consult' },
              { key: 'completed', label: 'Completed' },
            ].map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.filterPill, statusFilter === s.key && styles.filterPillActive]}
                onPress={() => setStatusFilter(s.key)}
              >
                <Text style={[styles.filterPillText, statusFilter === s.key && styles.filterPillTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingAppts && appointments.length === 0 ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : appointments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No appointments found</Text>
              <Text style={styles.emptySub}>Tap "+ Book" to schedule a consultation or register a walk-in visit.</Text>
            </View>
          ) : (
            appointments.map((appt) => {
              const st = APPT_STATUS_COLORS[appt.status] || APPT_STATUS_COLORS.scheduled;
              const dateDisplay = appt.appointment_date ? appt.appointment_date.split('T')[0] : '';
              const v = appt.vitals || {};
              const hasVitals = v.bp || v.temp || v.pulse || v.weight;
              return (
                <View key={appt.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{appt.patient_name}</Text>
                      <Text style={styles.cardMeta}>
                        📞 {appt.patient_phone} • Dr. {appt.doctor_name} {appt.specialization ? `(${appt.specialization})` : ''}
                      </Text>
                      <Text style={[styles.cardMeta, { color: COLORS.primary, fontWeight: '700', marginTop: 3 }]}>
                        🗓️ {dateDisplay} • ⏰ {appt.slot_time}–{appt.end_time} ({appt.visit_type})
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  </View>

                  {appt.reason ? <Text style={styles.reasonText}>Reason: {appt.reason}</Text> : null}
                  {hasVitals ? (
                    <Text style={styles.vitalsSummary}>
                      Vitals: {v.bp ? `BP ${v.bp} ` : ''}{v.temp ? `• Temp ${v.temp} ` : ''}{v.pulse ? `• Pulse ${v.pulse} ` : ''}{v.weight ? `• Wt ${v.weight}` : ''}
                    </Text>
                  ) : null}

                  <View style={styles.cardActionRow}>
                    {appt.status === 'scheduled' && (
                      <TouchableOpacity style={styles.primarySmallBtn} onPress={() => openCheckInModal(appt)}>
                        <Text style={styles.primarySmallBtnText}>✓ Check In & Vitals</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.secondarySmallBtn} onPress={() => handleViewPatientHistory(appt.patient_id)}>
                      <Text style={styles.secondarySmallBtnText}>📋 History</Text>
                    </TouchableOpacity>
                    {(appt.status === 'scheduled' || appt.status === 'checked_in') && (
                      <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => handleUpdateApptStatus(appt, 'cancelled')}>
                        <Text style={styles.cancelSmallBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 2: DOCTOR SCHEDULES & CALENDAR BLOCKING */}
      {tab === 'schedules' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <Text style={styles.sectionTitle}>Select Doctor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {doctors.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.filterPill, selectedScheduleDoctorId === String(d.id) && styles.filterPillActive]}
                onPress={() => setSelectedScheduleDoctorId(String(d.id))}
              >
                <Text style={[styles.filterPillText, selectedScheduleDoctorId === String(d.id) && styles.filterPillTextActive]}>
                  Dr. {d.name} {d.specialization ? `(${d.specialization})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedDocObj ? (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Dr. {selectedDocObj.name}'s Weekly Hours</Text>
                    <Text style={styles.cardMeta}>
                      Assigned Patients: {selectedDocObj.assigned_patients_count || 0} • Today's Appts: {selectedDocObj.today_appointments_count || 0}
                    </Text>
                  </View>
                  {hasPermission('manage_schedules') && (
                    <TouchableOpacity style={styles.secondarySmallBtn} onPress={openEditScheduleModal}>
                      <Text style={styles.secondarySmallBtnText}>Edit Hours</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {loadingSchedule ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 12 }} />
                ) : (
                  <View style={{ marginTop: 10 }}>
                    {doctorSchedules.map((s) => (
                      <View key={s.day_of_week} style={styles.schedRow}>
                        <Text style={styles.schedDay}>{DAY_NAMES[s.day_of_week]}</Text>
                        <Text style={styles.schedHours}>
                          {s.is_active ? `${s.start_time} – ${s.end_time} (${s.slot_duration_mins}m slots)` : 'Day Off'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={[styles.cardHeaderRow, { marginTop: 8, marginBottom: 10 }]}>
                <Text style={styles.sectionTitle}>Calendar Blocks</Text>
                {hasPermission('block_doctor_calendar') && (
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      setBlockForm({ blockDate: todayISO(), startTime: '13:00', endTime: '14:00', isFullDay: false, reason: '' });
                      setBlockModalVisible(true);
                    }}
                  >
                    <Text style={styles.addBtnText}>+ Block Calendar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {doctorBlocks.length === 0 ? (
                <Text style={styles.emptySub}>No upcoming calendar blocks for Dr. {selectedDocObj.name}.</Text>
              ) : (
                doctorBlocks.map((b) => (
                  <View key={b.id} style={[styles.card, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: '#991B1B' }]}>
                          🚫 {b.block_date ? b.block_date.split('T')[0] : ''} • {b.is_full_day ? 'FULL DAY' : `${b.start_time} – ${b.end_time}`}
                        </Text>
                        <Text style={styles.cardMeta}>Reason: {b.reason || 'Unavailable'}</Text>
                      </View>
                      {hasPermission('block_doctor_calendar') && (
                        <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => handleDeleteBlock(b.id)}>
                          <Text style={styles.cancelSmallBtnText}>Unblock</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          ) : (
            <Text style={styles.emptySub}>No active doctors in organization.</Text>
          )}
        </ScrollView>
      )}

      {/* TAB 3: DOCTOR-PATIENT ASSIGNMENTS */}
      {tab === 'mappings' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <View style={[styles.cardHeaderRow, { marginBottom: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Doctor–Patient Assignments ({mappings.length})</Text>
              <Text style={{ fontSize: 12, color: '#64748B' }}>
                Doctors can view and prescribe ONLY for patients actively assigned to them.
              </Text>
            </View>
            {hasPermission('assign_doctor_patient') && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  setAssignForm({
                    doctorId: doctors[0] ? String(doctors[0].id) : '',
                    patientId: patients[0] ? String(patients[0].id) : '',
                    exclusive: false,
                    notes: '',
                  });
                  setAssignModalVisible(true);
                }}
              >
                <Text style={styles.addBtnText}>+ Assign</Text>
              </TouchableOpacity>
            )}
          </View>

          {mappings.length === 0 ? (
            <Text style={styles.emptySub}>No active doctor–patient mappings yet.</Text>
          ) : (
            mappings.map((m) => (
              <View key={`${m.doctor_id}-${m.patient_id}`} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {m.patient_name} → Dr. {m.doctor_name}
                    </Text>
                    <Text style={styles.cardMeta}>
                      📞 {m.patient_phone} {m.specialization ? `• ${m.specialization}` : ''}
                    </Text>
                    {m.notes ? <Text style={styles.cardMeta}>Note: {m.notes}</Text> : null}
                  </View>
                  {hasPermission('assign_doctor_patient') && (
                    <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => handleUnassign(m)}>
                      <Text style={styles.cancelSmallBtnText}>Unassign</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* TAB 4: PATIENTS & HISTORY */}
      {tab === 'patients' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <View style={styles.toolbarRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search patient name or phone..."
              placeholderTextColor="#64748B"
              value={patientSearch}
              onChangeText={setPatientSearch}
              onSubmitEditing={fetchCoreDirectory}
              returnKeyType="search"
            />
            {hasPermission('register_walkin_patient') && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setWalkinModalVisible(true)}>
                <Text style={styles.addBtnText}>+ Walk-In</Text>
              </TouchableOpacity>
            )}
          </View>

          {patients.length === 0 ? (
            <Text style={styles.emptySub}>No patients found in clinic directory.</Text>
          ) : (
            patients.map((p) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{p.name}</Text>
                    <Text style={styles.cardMeta}>📞 {p.phone} • {p.email}</Text>
                    {Array.isArray(p.assigned_doctors) && p.assigned_doctors.length > 0 ? (
                      <Text style={[styles.cardMeta, { color: COLORS.primary, fontWeight: '700', marginTop: 4 }]}>
                        Assigned: {p.assigned_doctors.map((d) => `Dr. ${d.doctor_name}`).join(', ')}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>Not assigned to a doctor yet</Text>
                    )}
                  </View>
                  <TouchableOpacity style={styles.secondarySmallBtn} onPress={() => handleViewPatientHistory(p.id)}>
                    <Text style={styles.secondarySmallBtnText}>📋 History</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* BOOK APPOINTMENT MODAL */}
      <Modal visible={bookModalVisible} transparent animationType="slide" onRequestClose={() => setBookModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Doctor Appointment</Text>
              <TouchableOpacity onPress={() => setBookModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.inputLabel}>Doctor *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={bookingForm.doctorId}
                  onValueChange={(v) => setBookingForm((p) => ({ ...p, doctorId: v, slotTime: '' }))}
                  style={{ color: '#0F172A' }}
                >
                  {doctors.map((d) => (
                    <Picker.Item key={d.id} label={`Dr. ${d.name} (${d.specialization || 'General'})`} value={String(d.id)} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.inputLabel}>Patient *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={bookingForm.patientId}
                  onValueChange={(v) => setBookingForm((p) => ({ ...p, patientId: v }))}
                  style={{ color: '#0F172A' }}
                >
                  {patients.map((p) => (
                    <Picker.Item key={p.id} label={`${p.name} (${p.phone})`} value={String(p.id)} />
                  ))}
                </Picker>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD) *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={bookingForm.appointmentDate}
                    onChangeText={(v) => setBookingForm((p) => ({ ...p, appointmentDate: v, slotTime: '' }))}
                    placeholder="2026-11-10"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Visit Type</Text>
                  <View style={styles.pickerBox}>
                    <Picker
                      selectedValue={bookingForm.visitType}
                      onValueChange={(v) => setBookingForm((p) => ({ ...p, visitType: v }))}
                      style={{ color: '#0F172A' }}
                    >
                      <Picker.Item label="Consultation" value="consultation" />
                      <Picker.Item label="Follow-Up" value="follow_up" />
                      <Picker.Item label="Walk-In" value="walk_in" />
                      <Picker.Item label="Emergency" value="emergency" />
                    </Picker>
                  </View>
                </View>
              </View>

              <Text style={styles.inputLabel}>Select Time Slot *</Text>
              {loadingSlots ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
              ) : availableSlots.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#B45309', marginBottom: 8 }}>
                  No slots configured or doctor is off on this date.
                </Text>
              ) : (
                <View style={styles.slotGrid}>
                  {availableSlots.map((sl) => {
                    const isAvail = sl.status === 'available';
                    const isSel = bookingForm.slotTime === sl.time;
                    return (
                      <TouchableOpacity
                        key={sl.time}
                        disabled={!isAvail}
                        onPress={() => setBookingForm((p) => ({ ...p, slotTime: sl.time }))}
                        style={[
                          styles.slotChip,
                          !isAvail && styles.slotChipDisabled,
                          isSel && styles.slotChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotChipText,
                            !isAvail && styles.slotChipTextDisabled,
                            isSel && styles.slotChipTextSelected,
                          ]}
                        >
                          {sl.time} {sl.status === 'blocked' ? '🚫' : sl.status === 'booked' ? '•' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.inputLabel}>Chief Complaint / Reason</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Fever & cough since 2 days"
                placeholderTextColor="#64748B"
                value={bookingForm.reason}
                onChangeText={(v) => setBookingForm((p) => ({ ...p, reason: v }))}
              />

              <Text style={styles.inputLabel}>Optional Triage Vitals (BP / Temp / Pulse / Weight)</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.modalInput, styles.col]}
                  placeholder="BP 120/80"
                  placeholderTextColor="#64748B"
                  value={bookingForm.bp}
                  onChangeText={(v) => setBookingForm((p) => ({ ...p, bp: v }))}
                />
                <TextInput
                  style={[styles.modalInput, styles.col]}
                  placeholder="Temp 98.6F"
                  placeholderTextColor="#64748B"
                  value={bookingForm.temp}
                  onChangeText={(v) => setBookingForm((p) => ({ ...p, temp: v }))}
                />
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={handleConfirmBooking} disabled={bookingSaving}>
                {bookingSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Confirm Appointment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CHECK-IN & VITALS MODAL */}
      <Modal visible={!!vitalsModalAppt} transparent animationType="fade" onRequestClose={() => setVitalsModalAppt(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Check-In: {vitalsModalAppt?.patient_name}</Text>
              <TouchableOpacity onPress={() => setVitalsModalAppt(null)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>BP</Text>
                <TextInput style={styles.modalInput} placeholder="120/80" value={vitalsForm.bp} onChangeText={(v) => setVitalsForm((p) => ({ ...p, bp: v }))} />
              </View>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Temp</Text>
                <TextInput style={styles.modalInput} placeholder="98.6 F" value={vitalsForm.temp} onChangeText={(v) => setVitalsForm((p) => ({ ...p, temp: v }))} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Pulse (bpm)</Text>
                <TextInput style={styles.modalInput} placeholder="76" value={vitalsForm.pulse} onChangeText={(v) => setVitalsForm((p) => ({ ...p, pulse: v }))} />
              </View>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Weight (kg)</Text>
                <TextInput style={styles.modalInput} placeholder="68" value={vitalsForm.weight} onChangeText={(v) => setVitalsForm((p) => ({ ...p, weight: v }))} />
              </View>
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={handleConfirmCheckIn}>
              <Text style={styles.primaryBtnText}>Mark Checked In</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* BLOCK CALENDAR MODAL */}
      <Modal visible={blockModalVisible} transparent animationType="slide" onRequestClose={() => setBlockModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Block Doctor Calendar</Text>
              <TouchableOpacity onPress={() => setBlockModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={blockForm.blockDate}
              onChangeText={(v) => setBlockForm((p) => ({ ...p, blockDate: v }))}
              placeholder="2026-11-10"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
              <Text style={styles.inputLabel}>Full Day Block</Text>
              <Switch
                value={blockForm.isFullDay}
                onValueChange={(v) => setBlockForm((p) => ({ ...p, isFullDay: v }))}
                trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
              />
            </View>
            {!blockForm.isFullDay && (
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Start Time (HH:MM)</Text>
                  <TextInput style={styles.modalInput} value={blockForm.startTime} onChangeText={(v) => setBlockForm((p) => ({ ...p, startTime: v }))} />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>End Time (HH:MM)</Text>
                  <TextInput style={styles.modalInput} value={blockForm.endTime} onChangeText={(v) => setBlockForm((p) => ({ ...p, endTime: v }))} />
                </View>
              </View>
            )}
            <Text style={styles.inputLabel}>Reason</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Surgery, Lunch Break, Leave..."
              placeholderTextColor="#64748B"
              value={blockForm.reason}
              onChangeText={(v) => setBlockForm((p) => ({ ...p, reason: v }))}
            />
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={() => submitCalendarBlock(false, false)} disabled={savingBlock}>
              {savingBlock ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Block Calendar</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT WEEKLY SCHEDULE MODAL */}
      <Modal visible={scheduleEditModalVisible} transparent animationType="slide" onRequestClose={() => setScheduleEditModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Weekly Schedule</Text>
              <TouchableOpacity onPress={() => setScheduleEditModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {editableSchedule.map((day, idx) => (
                <View key={day.day_of_week} style={styles.editSchedCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardTitle}>{DAY_NAMES[day.day_of_week]}</Text>
                    <Switch
                      value={day.is_active}
                      onValueChange={(v) => {
                        const copy = [...editableSchedule];
                        copy[idx].is_active = v;
                        setEditableSchedule(copy);
                      }}
                      trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                    />
                  </View>
                  {day.is_active && (
                    <View style={[styles.row, { marginTop: 6 }]}>
                      <TextInput
                        style={[styles.modalInput, styles.col]}
                        value={day.start_time}
                        onChangeText={(v) => {
                          const copy = [...editableSchedule];
                          copy[idx].start_time = v;
                          setEditableSchedule(copy);
                        }}
                        placeholder="09:00"
                      />
                      <TextInput
                        style={[styles.modalInput, styles.col]}
                        value={day.end_time}
                        onChangeText={(v) => {
                          const copy = [...editableSchedule];
                          copy[idx].end_time = v;
                          setEditableSchedule(copy);
                        }}
                        placeholder="17:00"
                      />
                      <TextInput
                        style={[styles.modalInput, { width: 70 }]}
                        keyboardType="numeric"
                        value={String(day.slot_duration_mins || 30)}
                        onChangeText={(v) => {
                          const copy = [...editableSchedule];
                          copy[idx].slot_duration_mins = parseInt(v || '30', 10);
                          setEditableSchedule(copy);
                        }}
                        placeholder="30"
                      />
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={handleSaveSchedule} disabled={savingSchedule}>
                {savingSchedule ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Save Weekly Schedule</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ASSIGN PATIENT MODAL */}
      <Modal visible={assignModalVisible} transparent animationType="slide" onRequestClose={() => setAssignModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Patient to Doctor</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Patient</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={assignForm.patientId} onValueChange={(v) => setAssignForm((p) => ({ ...p, patientId: v }))} style={{ color: '#0F172A' }}>
                {patients.map((p) => (
                  <Picker.Item key={p.id} label={`${p.name} (${p.phone})`} value={String(p.id)} />
                ))}
              </Picker>
            </View>
            <Text style={styles.inputLabel}>Doctor</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={assignForm.doctorId} onValueChange={(v) => setAssignForm((p) => ({ ...p, doctorId: v }))} style={{ color: '#0F172A' }}>
                {doctors.map((d) => (
                  <Picker.Item key={d.id} label={`Dr. ${d.name} (${d.specialization || 'General'})`} value={String(d.id)} />
                ))}
              </Picker>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.inputLabel}>Exclusive Care Transfer</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>Unassign from any previously assigned doctors</Text>
              </View>
              <Switch
                value={assignForm.exclusive}
                onValueChange={(v) => setAssignForm((p) => ({ ...p, exclusive: v }))}
                trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
              />
            </View>
            <Text style={styles.inputLabel}>Assignment Notes</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Referred for Cardiology consultation"
              placeholderTextColor="#64748B"
              value={assignForm.notes}
              onChangeText={(v) => setAssignForm((p) => ({ ...p, notes: v }))}
            />
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={handleAssignPatient} disabled={savingAssign}>
              {savingAssign ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Save Assignment</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* WALK-IN PATIENT REGISTRATION MODAL */}
      <Modal visible={walkinModalVisible} transparent animationType="slide" onRequestClose={() => setWalkinModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Walk-In Patient</Text>
              <TouchableOpacity onPress={() => setWalkinModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Patient Name *</Text>
            <TextInput style={styles.modalInput} placeholder="Full Name" value={walkinForm.name} onChangeText={(v) => setWalkinForm((p) => ({ ...p, name: v }))} />
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput style={styles.modalInput} placeholder="10-digit Phone" keyboardType="phone-pad" value={walkinForm.phone} onChangeText={(v) => setWalkinForm((p) => ({ ...p, phone: v }))} />
            <Text style={styles.inputLabel}>Email (Optional)</Text>
            <TextInput style={styles.modalInput} placeholder="patient@email.com" autoCapitalize="none" value={walkinForm.email} onChangeText={(v) => setWalkinForm((p) => ({ ...p, email: v }))} />
            <Text style={styles.inputLabel}>Assign to Doctor Immediately (Optional)</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={walkinForm.doctorId} onValueChange={(v) => setWalkinForm((p) => ({ ...p, doctorId: v }))} style={{ color: '#0F172A' }}>
                <Picker.Item label="-- None yet --" value="" />
                {doctors.map((d) => (
                  <Picker.Item key={d.id} label={`Dr. ${d.name}`} value={String(d.id)} />
                ))}
              </Picker>
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={handleRegisterWalkin} disabled={savingWalkin}>
              {savingWalkin ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Register Patient</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PATIENT HISTORY MODAL */}
      <Modal visible={!!historyModalData} transparent animationType="slide" onRequestClose={() => setHistoryModalData(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Patient Visit History</Text>
                {historyModalData?.patient && (
                  <Text style={styles.cardMeta}>
                    {historyModalData.patient.name} • 📞 {historyModalData.patient.phone}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setHistoryModalData(null)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            {loadingHistory || historyModalData?.loading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <Text style={styles.sectionTitle}>CheckUp History ({historyModalData?.checkups?.length || 0})</Text>
                {(historyModalData?.checkups || []).length === 0 ? (
                  <Text style={styles.cardMeta}>No clinical checkups recorded yet.</Text>
                ) : (
                  historyModalData.checkups.map((chk) => {
                    const v = chk.vitals || {};
                    return (
                      <View key={chk.id} style={[styles.historyBlock, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
                        <Text style={[styles.orderMedName, { color: '#0F766E' }]}>
                          {chk.visit_date?.split('T')[0]} • Dr. {chk.doctor_name} — {chk.diagnosis || 'Consultation'}
                        </Text>
                        {chk.chief_complaint ? <Text style={styles.cardMeta}>Complaint: {chk.chief_complaint}</Text> : null}
                        {(v.bp || v.temp || v.pulse || v.weight || v.spo2) && (
                          <Text style={[styles.cardMeta, { color: '#115E59', fontWeight: '600' }]}>
                            Vitals: {v.bp ? `BP ${v.bp} ` : ''}{v.temp ? `• Temp ${v.temp} ` : ''}{v.pulse ? `• Pulse ${v.pulse} ` : ''}{v.spo2 ? `• SpO2 ${v.spo2}` : ''}
                          </Text>
                        )}
                        {chk.clinical_notes ? <Text style={styles.cardMeta}>Notes: {chk.clinical_notes}</Text> : null}
                        {chk.follow_up_date ? (
                          <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '700', marginTop: 2 }}>
                            Follow-Up Due: {chk.follow_up_date.split('T')[0]}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Appointments ({historyModalData?.appointments?.length || 0})</Text>
                {(historyModalData?.appointments || []).length === 0 ? (
                  <Text style={styles.cardMeta}>No past appointments.</Text>
                ) : (
                  historyModalData.appointments.map((a) => (
                    <View key={a.id} style={styles.historyBlock}>
                      <Text style={styles.orderMedName}>
                        {a.appointment_date?.split('T')[0]} at {a.slot_time} • Dr. {a.doctor_name} ({a.status})
                      </Text>
                      {a.reason ? <Text style={styles.cardMeta}>Reason: {a.reason}</Text> : null}
                    </View>
                  ))
                )}

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Doctor Assignments ({historyModalData?.mappings?.length || 0})</Text>
                {(historyModalData?.mappings || []).map((m, idx) => (
                  <View key={idx} style={styles.historyBlock}>
                    <Text style={styles.orderMedName}>
                      Dr. {m.doctor_name} ({m.is_active ? 'Active' : 'Past'})
                    </Text>
                    {m.notes ? <Text style={styles.cardMeta}>{m.notes}</Text> : null}
                  </View>
                ))}

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Prescriptions ({historyModalData?.prescriptions?.length || 0})</Text>
                {(historyModalData?.prescriptions || []).length === 0 ? (
                  <Text style={styles.cardMeta}>No prescriptions on record.</Text>
                ) : (
                  historyModalData.prescriptions.map((rx) => (
                    <View key={rx.prescription_id} style={styles.historyBlock}>
                      <Text style={styles.orderMedName}>
                        Rx #{rx.prescription_id} • Dr. {rx.doctor_name} ({new Date(rx.created_at).toLocaleDateString()})
                      </Text>
                      {(rx.medicines || []).map((med, i) => (
                        <Text key={i} style={styles.cardMeta}>
                          • {med.medicine_name} ({med.dosage}, {med.duration_days}d)
                        </Text>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <LanguageSelectorModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 54 : 38,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  headerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  logoutBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  logoutText: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
  tabWrapper: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  toolbarRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: '#0F172A',
  },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', height: 44 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', height: 44 },
  secondaryBtnText: { color: '#3730A3', fontWeight: '700', fontSize: 12 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterPillActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: COLORS.primary, fontWeight: '700' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    ...SHADOWS.small,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cardMeta: { fontSize: 12, color: '#475569', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  reasonText: { fontSize: 12, color: '#334155', marginTop: 6, fontStyle: 'italic' },
  vitalsSummary: { fontSize: 11, color: '#0F766E', backgroundColor: '#F0FDFA', padding: 6, borderRadius: 6, marginTop: 6, fontWeight: '600' },
  cardActionRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  primarySmallBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primarySmallBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  secondarySmallBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  secondarySmallBtnText: { color: '#3730A3', fontSize: 12, fontWeight: '700' },
  cancelSmallBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  cancelSmallBtnText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },
  schedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  schedDay: { fontSize: 13, fontWeight: '700', color: '#0F172A', width: 50 },
  schedHours: { fontSize: 13, color: '#334155' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 24, alignItems: 'center', ...SHADOWS.small },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, maxHeight: '88%', width: '100%', ...SHADOWS.large },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  closeX: { fontSize: 18, fontWeight: '700', color: '#64748B', padding: 4 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 5, marginTop: 8 },
  modalInput: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  pickerBox: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  slotChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  slotChipDisabled: { borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' },
  slotChipSelected: { backgroundColor: COLORS.primary },
  slotChipText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  slotChipTextDisabled: { color: '#94A3B8', textDecorationLine: 'line-through' },
  slotChipTextSelected: { color: '#FFFFFF' },
  editSchedCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  historyBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  orderMedName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  primaryBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

