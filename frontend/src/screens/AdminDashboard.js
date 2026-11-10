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
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { AuthContext, API_URL } from '../context/AuthContext';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../theme/theme';
import LanguageSelectorModal, { LanguageButton } from '../components/LanguageSelectorModal';

const ROLE_LABELS = {
  admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  pharmacy_manager: 'Pharmacy Mgr',
  patient: 'Patient',
};

const ROLE_COLORS = {
  admin: { bg: '#EDE9FE', text: '#6D28D9', border: '#DDD6FE' },
  doctor: { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' },
  receptionist: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  pharmacy_manager: { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0' },
  patient: { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' },
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { logout, userInfo } = useContext(AuthContext);
  const [tab, setTab] = useState('overview'); // 'overview' | 'staff' | 'clinic'
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Metadata
  const [rolesMeta, setRolesMeta] = useState({
    roles: ['patient', 'doctor', 'pharmacy_manager', 'receptionist', 'admin'],
    permissions: [],
    defaultRolePermissions: {},
  });

  // Overview state
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Staff & Users state
  const [usersList, setUsersList] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'doctor' | 'receptionist' | 'pharmacy_manager' | 'patient' | 'suspended'
  const [searchQuery, setSearchQuery] = useState('');

  // Add Staff Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'doctor',
    specialization: '',
    permissions: [],
  });

  // Manage / Approve User Modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({
    role: 'doctor',
    status: 'active',
    specialization: '',
    permissions: [],
  });
  const [savingUser, setSavingUser] = useState(false);

  // Organization & Audit state
  const [org, setOrg] = useState({ name: '', code: '', address: '', phone: '' });
  const [savingOrg, setSavingOrg] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  const fetchMetadata = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/roles-metadata`);
      if (res.data?.success) {
        setRolesMeta(res.data);
        setNewStaff((prev) => ({
          ...prev,
          permissions: res.data.defaultRolePermissions?.[prev.role] || [],
        }));
      }
    } catch (e) {
      console.log('Metadata load note:', e.message);
    }
  };

  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await axios.get(`${API_URL}/admin/overview`);
      if (res.data?.success) setOverview(res.data.overview);
    } catch (e) {
      console.log('Overview load error:', e.message);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchUsersAndPending = async () => {
    setLoadingUsers(true);
    try {
      const params = {};
      if (roleFilter === 'suspended') {
        params.status = 'suspended';
      } else if (roleFilter !== 'all') {
        params.role = roleFilter;
      }
      if (searchQuery.trim()) params.q = searchQuery.trim();

      const [usersRes, pendingRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`, { params }),
        axios.get(`${API_URL}/admin/pending`),
      ]);
      if (usersRes.data?.success) setUsersList(usersRes.data.users || []);
      if (pendingRes.data?.success) setPendingList(pendingRes.data.pending || []);
    } catch (e) {
      console.log('Fetch users error:', e.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchClinicAndAudit = async () => {
    try {
      const [orgRes, logsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/organization`),
        axios.get(`${API_URL}/admin/audit-logs`),
      ]);
      if (orgRes.data?.organization) setOrg(orgRes.data.organization);
      if (logsRes.data?.logs) setAuditLogs(logsRes.data.logs);
    } catch (e) {
      console.log('Clinic/Audit load error:', e.message);
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchMetadata(), fetchOverview(), fetchUsersAndPending(), fetchClinicAndAudit()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    fetchUsersAndPending();
  }, [roleFilter]);

  const handleOpenAddModal = () => {
    const defaultRole = 'doctor';
    setNewStaff({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: defaultRole,
      specialization: '',
      permissions: rolesMeta.defaultRolePermissions?.[defaultRole] || [],
    });
    setAddModalVisible(true);
  };

  const handleChangeNewStaffRole = (nextRole) => {
    setNewStaff((prev) => ({
      ...prev,
      role: nextRole,
      permissions: rolesMeta.defaultRolePermissions?.[nextRole] || [],
    }));
  };

  const toggleNewStaffPerm = (key) => {
    setNewStaff((prev) => {
      const exists = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: exists ? prev.permissions.filter((p) => p !== key) : [...prev.permissions, key],
      };
    });
  };

  const handleCreateStaff = async () => {
    if (!newStaff.name.trim() || !newStaff.email.trim() || !newStaff.phone.trim() || !newStaff.password) {
      Alert.alert('Missing Details', 'Name, email, phone, and password are required.');
      return;
    }
    setCreatingStaff(true);
    try {
      const res = await axios.post(`${API_URL}/admin/users`, newStaff);
      if (res.data?.success) {
        Alert.alert('Success', res.data.message || 'Staff user created and activated.');
        setAddModalVisible(false);
        fetchUsersAndPending();
        fetchOverview();
        fetchClinicAndAudit();
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not create user');
    } finally {
      setCreatingStaff(false);
    }
  };

  const openManageUser = (user) => {
    setSelectedUser(user);
    const currentPerms = Array.isArray(user.permissions) && user.permissions.length > 0
      ? user.permissions
      : (rolesMeta.defaultRolePermissions?.[user.role] || []);
    setEditForm({
      role: user.role,
      status: user.status || 'active',
      specialization: user.specialization || '',
      permissions: currentPerms,
    });
  };

  const handleEditRoleChange = (nextRole) => {
    setEditForm((prev) => ({
      ...prev,
      role: nextRole,
      permissions: rolesMeta.defaultRolePermissions?.[nextRole] || [],
    }));
  };

  const toggleEditPerm = (key) => {
    setEditForm((prev) => {
      const exists = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: exists ? prev.permissions.filter((p) => p !== key) : [...prev.permissions, key],
      };
    });
  };

  const handleQuickApprove = async (user) => {
    try {
      const res = await axios.patch(`${API_URL}/admin/users/${user.id}/approve`, {});
      if (res.data?.success) {
        Alert.alert('Approved', `${user.name} is now active as ${ROLE_LABELS[user.role] || user.role}.`);
        fetchUsersAndPending();
        fetchOverview();
        fetchClinicAndAudit();
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not approve user');
    }
  };

  const handleSaveUserChanges = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    try {
      if (selectedUser.status === 'pending_approval' && editForm.status === 'active') {
        await axios.patch(`${API_URL}/admin/users/${selectedUser.id}/approve`, {
          role: editForm.role,
          permissions: editForm.permissions,
          specialization: editForm.specialization,
        });
      } else {
        await axios.patch(`${API_URL}/admin/users/${selectedUser.id}`, editForm);
      }
      Alert.alert('Saved', `Updated ${selectedUser.name}'s role, status, and features.`);
      setSelectedUser(null);
      fetchUsersAndPending();
      fetchOverview();
      fetchClinicAndAudit();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update user');
    } finally {
      setSavingUser(false);
    }
  };

  const handleRemoveUser = (user) => {
    Alert.alert(
      'Remove User',
      `Remove ${user.name} from the organization? Historical medical records and prescriptions will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/admin/users/${user.id}`);
              if (selectedUser?.id === user.id) setSelectedUser(null);
              fetchUsersAndPending();
              fetchOverview();
              fetchClinicAndAudit();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not remove user');
            }
          },
        },
      ]
    );
  };

  const handleSaveOrganization = async () => {
    setSavingOrg(true);
    try {
      const res = await axios.put(`${API_URL}/admin/organization`, org);
      if (res.data?.organization) setOrg(res.data.organization);
      Alert.alert('Updated', 'Clinic organization details updated.');
      fetchClinicAndAudit();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update clinic settings');
    } finally {
      setSavingOrg(false);
    }
  };

  const renderRoleBadge = (role) => {
    const palette = ROLE_COLORS[role] || ROLE_COLORS.patient;
    return (
      <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <Text style={[styles.badgeText, { color: palette.text }]}>{ROLE_LABELS[role] || role}</Text>
      </View>
    );
  };

  const renderStatusBadge = (status) => {
    const map = {
      active: { bg: '#DCFCE7', text: '#15803D', label: 'Active' },
      pending_approval: { bg: '#FEF3C7', text: '#B45309', label: 'Pending' },
      suspended: { bg: '#FEE2E2', text: '#B91C1C', label: 'Suspended' },
    };
    const cfg = map[status] || map.active;
    return (
      <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: 'transparent' }]}>
        <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {userInfo?.is_superadmin ? 'Superadmin Console' : 'Clinic Admin'}
          </Text>
          <Text style={styles.headerSub}>
            {userInfo?.name || 'Admin'} • Org: {org?.code || 'MEDTRACK01'}
          </Text>
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
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'overview' && styles.tabBtnActive]}
            onPress={() => setTab('overview')}
          >
            <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>
              📊 Overview & Stats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'staff' && styles.tabBtnActive]}
            onPress={() => setTab('staff')}
          >
            <Text style={[styles.tabText, tab === 'staff' && styles.tabTextActive]}>
              👥 Staff & Approvals {pendingList.length > 0 ? `(${pendingList.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'clinic' && styles.tabBtnActive]}
            onPress={() => setTab('clinic')}
          >
            <Text style={[styles.tabText, tab === 'clinic' && styles.tabTextActive]}>
              🏥 Clinic & Audit
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Content */}
      {tab === 'overview' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          {pendingList.length > 0 && (
            <TouchableOpacity style={styles.alertBanner} onPress={() => setTab('staff')}>
              <Text style={styles.alertBannerTitle}>
                ⏳ {pendingList.length} Staff Approval{pendingList.length > 1 ? 's' : ''} Waiting
              </Text>
              <Text style={styles.alertBannerSub}>
                Tap here to review pending Doctor, Receptionist, or Pharmacy Manager requests.
              </Text>
            </TouchableOpacity>
          )}

          {loadingOverview && !overview ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : overview ? (
            <>
              <Text style={styles.sectionTitle}>Organization Directory Breakdown</Text>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{overview.users.activeDoctors}</Text>
                  <Text style={styles.kpiLabel}>Active Doctors</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{overview.users.activeReceptionists}</Text>
                  <Text style={styles.kpiLabel}>Receptionists</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{overview.users.activePharmacyManagers}</Text>
                  <Text style={styles.kpiLabel}>Pharmacy Mgrs</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{overview.users.activePatients}</Text>
                  <Text style={styles.kpiLabel}>Patients</Text>
                </View>
                <View style={[styles.kpiCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.kpiValue, { color: '#B45309' }]}>{overview.users.pendingApprovals}</Text>
                  <Text style={styles.kpiLabel}>Pending Approval</Text>
                </View>
                <View style={[styles.kpiCard, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.kpiValue, { color: '#B91C1C' }]}>{overview.users.suspendedUsers}</Text>
                  <Text style={styles.kpiLabel}>Suspended</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Clinical & Pharmacy Operations</Text>
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Total Prescriptions Issued</Text>
                  <Text style={styles.statRowVal}>{overview.prescriptions.total_prescriptions}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Prescriptions (Last 7 Days)</Text>
                  <Text style={styles.statRowVal}>{overview.prescriptions.rx_last_7_days}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Clinic Pharmacy Items Prescribed</Text>
                  <Text style={[styles.statRowVal, { color: '#15803D' }]}>{overview.medicines.clinic_pharmacy_count}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Buy Outside Items Prescribed</Text>
                  <Text style={styles.statRowVal}>{overview.medicines.buy_outside_count}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Patient Dose Intakes (7d Adherence)</Text>
                  <Text style={[styles.statRowVal, { color: COLORS.primary }]}>{overview.adherence.intakes_last_7_days}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Inventory Health Snapshot</Text>
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Catalog SKUs / Total Units</Text>
                  <Text style={styles.statRowVal}>
                    {overview.inventory.total_skus} SKUs ({overview.inventory.total_units} units)
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Low Stock Warnings</Text>
                  <Text style={[styles.statRowVal, { color: overview.inventory.low_stock_count > 0 ? '#B91C1C' : '#15803D' }]}>
                    {overview.inventory.low_stock_count}
                  </Text>
                </View>
                <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.statRowLabel}>Expiring Within 30 Days</Text>
                  <Text style={[styles.statRowVal, { color: overview.inventory.expiring_soon_count > 0 ? '#B45309' : '#15803D' }]}>
                    {overview.inventory.expiring_soon_count}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      {tab === 'staff' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          {/* Pending Approvals Section */}
          {pendingList.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>Pending Approval Requests ({pendingList.length})</Text>
              {pendingList.map((u) => (
                <View key={u.id} style={styles.pendingItemCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardTitle}>{u.name}</Text>
                    {renderRoleBadge(u.role)}
                  </View>
                  <Text style={styles.cardMeta}>{u.email} • {u.phone}</Text>
                  {u.specialization ? <Text style={styles.cardSpec}>Specialty: {u.specialization}</Text> : null}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: COLORS.primary }]}
                      onPress={() => handleQuickApprove(u)}
                    >
                      <Text style={styles.smallBtnText}>✓ Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }]}
                      onPress={() => openManageUser(u)}
                    >
                      <Text style={[styles.smallBtnText, { color: '#3730A3' }]}>Review & Assign</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]}
                      onPress={() => handleRemoveUser(u)}
                    >
                      <Text style={[styles.smallBtnText, { color: '#B91C1C' }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Search & Add Header */}
          <View style={styles.toolbarRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search staff or patient..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={fetchUsersAndPending}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal}>
              <Text style={styles.addBtnText}>+ Add Staff</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'doctor', label: 'Doctors' },
              { key: 'receptionist', label: 'Receptionists' },
              { key: 'pharmacy_manager', label: 'Pharmacy Mgrs' },
              { key: 'patient', label: 'Patients' },
              { key: 'suspended', label: 'Suspended' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, roleFilter === f.key && styles.filterPillActive]}
                onPress={() => setRoleFilter(f.key)}
              >
                <Text style={[styles.filterPillText, roleFilter === f.key && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingUsers ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
          ) : usersList.length === 0 ? (
            <Text style={styles.emptyText}>No matching users found.</Text>
          ) : (
            usersList.map((u) => (
              <View key={u.id} style={styles.userCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.cardTitle}>
                      {u.name} {u.is_superadmin ? '👑' : ''}
                    </Text>
                    <Text style={styles.cardMeta}>{u.email} • {u.phone}</Text>
                    {u.specialization ? <Text style={styles.cardSpec}>Specialty: {u.specialization}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {renderRoleBadge(u.role)}
                    {renderStatusBadge(u.status)}
                  </View>
                </View>

                <View style={styles.userCardFooter}>
                  <Text style={styles.permSummary}>
                    Features: {Array.isArray(u.permissions) ? u.permissions.length : 0} enabled
                  </Text>
                  {u.id !== userInfo?.id && !(u.is_superadmin && !userInfo?.is_superadmin) && (
                    <TouchableOpacity style={styles.manageBtn} onPress={() => openManageUser(u)}>
                      <Text style={styles.manageBtnText}>Manage Role & Features</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {tab === 'clinic' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <Text style={styles.sectionTitle}>Clinic / Organization Settings</Text>
          <View style={styles.statsCard}>
            <Text style={styles.inputLabel}>Clinic Name</Text>
            <TextInput
              style={styles.modalInput}
              value={org.name || ''}
              onChangeText={(v) => setOrg((p) => ({ ...p, name: v }))}
              placeholder="Clinic Name"
            />
            <Text style={styles.inputLabel}>Clinic Invite Code (Share with Staff)</Text>
            <TextInput
              style={styles.modalInput}
              value={org.code || ''}
              onChangeText={(v) => setOrg((p) => ({ ...p, code: v }))}
              placeholder="MEDTRACK01"
              autoCapitalize="characters"
            />
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.modalInput}
              value={org.phone || ''}
              onChangeText={(v) => setOrg((p) => ({ ...p, phone: v }))}
              placeholder="Clinic Phone"
            />
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
              style={styles.modalInput}
              value={org.address || ''}
              onChangeText={(v) => setOrg((p) => ({ ...p, address: v }))}
              placeholder="Clinic Address"
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveOrganization} disabled={savingOrg}>
              {savingOrg ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Save Clinic Settings</Text>}
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Admin & Security Audit Log</Text>
          {auditLogs.length === 0 ? (
            <Text style={styles.emptyText}>No audit entries yet.</Text>
          ) : (
            auditLogs.map((log) => (
              <View key={log.id} style={styles.auditItem}>
                <Text style={styles.auditAction}>{log.action.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.auditMeta}>
                  Actor: {log.actor_name || 'System'} {log.target_name ? `→ Target: ${log.target_name}` : ''}
                </Text>
                <Text style={styles.auditDate}>
                  {new Date(log.created_at).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Staff Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Organization Member</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Dr. Anita Sharma"
                placeholderTextColor="#64748B"
                value={newStaff.name}
                onChangeText={(v) => setNewStaff((p) => ({ ...p, name: v }))}
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="anita@clinic.com"
                placeholderTextColor="#64748B"
                value={newStaff.email}
                onChangeText={(v) => setNewStaff((p) => ({ ...p, email: v }))}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="9876543210"
                placeholderTextColor="#64748B"
                value={newStaff.phone}
                onChangeText={(v) => setNewStaff((p) => ({ ...p, phone: v }))}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Temporary Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Min 6 characters"
                placeholderTextColor="#64748B"
                value={newStaff.password}
                onChangeText={(v) => setNewStaff((p) => ({ ...p, password: v }))}
                secureTextEntry
              />

              <Text style={styles.inputLabel}>Assign Role</Text>
              <View style={styles.rolePickRow}>
                {(userInfo?.is_superadmin
                  ? ['doctor', 'receptionist', 'pharmacy_manager', 'admin', 'patient']
                  : ['doctor', 'receptionist', 'pharmacy_manager', 'patient']
                ).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.rolePickChip, newStaff.role === r && styles.rolePickChipActive]}
                    onPress={() => handleChangeNewStaffRole(r)}
                  >
                    <Text style={[styles.rolePickText, newStaff.role === r && styles.rolePickTextActive]}>
                      {ROLE_LABELS[r] || r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {newStaff.role === 'doctor' && (
                <>
                  <Text style={styles.inputLabel}>Specialization</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. General Physician, Pediatrics"
                    placeholderTextColor="#64748B"
                    value={newStaff.specialization}
                    onChangeText={(v) => setNewStaff((p) => ({ ...p, specialization: v }))}
                  />
                </>
              )}

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Feature Permissions</Text>
              {rolesMeta.permissions.map((perm) => {
                const enabled = newStaff.permissions.includes(perm.key);
                return (
                  <View key={perm.key} style={styles.permToggleRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permLabel}>{perm.label} ({perm.group})</Text>
                      <Text style={styles.permDesc}>{perm.description}</Text>
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={() => toggleNewStaffPerm(perm.key)}
                      trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                    />
                  </View>
                );
              })}

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={handleCreateStaff} disabled={creatingStaff}>
                {creatingStaff ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Create & Activate Member</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manage Role & Features Modal */}
      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedUser?.name}</Text>
                <Text style={styles.cardMeta}>{selectedUser?.email}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.inputLabel}>Role Assignment</Text>
              <View style={styles.rolePickRow}>
                {(userInfo?.is_superadmin
                  ? ['doctor', 'receptionist', 'pharmacy_manager', 'admin', 'patient']
                  : ['doctor', 'receptionist', 'pharmacy_manager', 'patient']
                ).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.rolePickChip, editForm.role === r && styles.rolePickChipActive]}
                    onPress={() => handleEditRoleChange(r)}
                  >
                    <Text style={[styles.rolePickText, editForm.role === r && styles.rolePickTextActive]}>
                      {ROLE_LABELS[r] || r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Account Status</Text>
              <View style={styles.rolePickRow}>
                {[
                  { key: 'active', label: 'Active' },
                  { key: 'suspended', label: 'Suspended' },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.rolePickChip, editForm.status === s.key && styles.rolePickChipActive]}
                    onPress={() => setEditForm((p) => ({ ...p, status: s.key }))}
                  >
                    <Text style={[styles.rolePickText, editForm.status === s.key && styles.rolePickTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editForm.role === 'doctor' && (
                <>
                  <Text style={styles.inputLabel}>Specialization</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. Cardiology"
                    placeholderTextColor="#64748B"
                    value={editForm.specialization}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, specialization: v }))}
                  />
                </>
              )}

              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Assigned Features</Text>
              {rolesMeta.permissions.map((perm) => {
                const enabled = editForm.permissions.includes(perm.key);
                return (
                  <View key={perm.key} style={styles.permToggleRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.permLabel}>{perm.label} ({perm.group})</Text>
                      <Text style={styles.permDesc}>{perm.description}</Text>
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={() => toggleEditPerm(perm.key)}
                      trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                    />
                  </View>
                );
              })}

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={handleSaveUserChanges} disabled={savingUser}>
                {savingUser ? <ActivityIndicator color="#FFF" /> : (
                  <Text style={styles.primaryBtnText}>
                    {selectedUser?.status === 'pending_approval' ? 'Approve & Save Features' : 'Save Role & Features'}
                  </Text>
                )}
              </TouchableOpacity>

              {selectedUser && (
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={() => handleRemoveUser(selectedUser)}
                >
                  <Text style={styles.dangerBtnText}>Remove from Organization</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  logoutText: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
  tabWrapper: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  alertBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  alertBannerTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  alertBannerSub: { fontSize: 12, color: '#B45309', marginTop: 3 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  kpiValue: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...SHADOWS.small,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  statRowLabel: { fontSize: 13, color: '#334155', fontWeight: '500' },
  statRowVal: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  pendingItemCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  toolbarRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
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
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    ...SHADOWS.small,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  cardSpec: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  userCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  permSummary: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  manageBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  manageBtnText: { color: '#3730A3', fontSize: 12, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 24, fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    maxHeight: '88%',
    width: '100%',
    ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  closeX: { fontSize: 18, fontWeight: '700', color: '#64748B', padding: 4 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 8 },
  modalInput: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 6,
  },
  rolePickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  rolePickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  rolePickChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  rolePickText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  rolePickTextActive: { color: COLORS.primary, fontWeight: '700' },
  permToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  permLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  permDesc: { fontSize: 11, color: '#64748B' },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  dangerBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  dangerBtnText: { color: '#B91C1C', fontWeight: '700', fontSize: 13 },
  auditItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  auditAction: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  auditMeta: { fontSize: 12, color: '#334155', marginTop: 3 },
  auditDate: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
});

