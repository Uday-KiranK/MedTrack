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

const ORDER_STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#B45309', label: 'Pending Dispense' },
  partially_dispensed: { bg: '#E0F2FE', text: '#0369A1', label: 'Partial' },
  dispensed: { bg: '#DCFCE7', text: '#15803D', label: 'Dispensed' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
};

export default function PharmacyDashboard() {
  const { t } = useTranslation();
  const { logout, userInfo, hasPermission } = useContext(AuthContext);
  const [tab, setTab] = useState('orders'); // 'orders' | 'inventory' | 'invoices' | 'analytics'
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Dispense Queue State
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('pending');
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Dispense Modal State
  const [dispenseModalOrder, setDispenseModalOrder] = useState(null);
  const [dispenseQuantities, setDispenseQuantities] = useState({});
  const [dispenseBilling, setDispenseBilling] = useState({
    discountAmount: '0',
    taxPercent: '0',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    notes: '',
  });
  const [dispensing, setDispensing] = useState(false);

  // Inventory State
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [invFilter, setInvFilter] = useState('all'); // 'all' | 'low' | 'expiring' | 'out'
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    medicine_name: '',
    brand_name: '',
    strength: '',
    form: 'Tablet',
    stock_quantity: '',
    batch_number: '',
    expiry_date: '',
    reorder_level: '10',
    cost_price: '',
    selling_price: '',
    supplier_name: '',
  });

  // Invoices State
  const [invoices, setInvoices] = useState([]);
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Analytics & Movements State
  const [analytics, setAnalytics] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const fetchOrders = async () => {
    if (!hasPermission('dispense_prescriptions')) return;
    setLoadingOrders(true);
    try {
      const res = await axios.get(`${API_URL}/pharmacy/orders`, { params: { status: orderFilter } });
      if (res.data?.success) setOrders(res.data.orders || []);
    } catch (e) {
      console.log('Fetch orders note:', e.message);
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchInventory = async () => {
    if (!hasPermission('manage_inventory')) return;
    setLoadingInventory(true);
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      setInventoryItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (e) {
      console.log('Fetch inventory note:', e.message);
    } finally {
      setLoadingInventory(false);
    }
  };

  const fetchInvoices = async () => {
    if (!hasPermission('generate_invoices') && !hasPermission('view_pharmacy_analytics')) return;
    setLoadingInvoices(true);
    try {
      const res = await axios.get(`${API_URL}/pharmacy/invoices`, { params: { status: invoiceFilter } });
      if (res.data?.success) setInvoices(res.data.invoices || []);
    } catch (e) {
      console.log('Fetch invoices note:', e.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const fetchAnalyticsAndMovements = async () => {
    if (!hasPermission('view_pharmacy_analytics') && !hasPermission('manage_inventory')) return;
    setLoadingAnalytics(true);
    try {
      const [anRes, movRes] = await Promise.all([
        axios.get(`${API_URL}/pharmacy/analytics`),
        axios.get(`${API_URL}/pharmacy/movements`),
      ]);
      if (anRes.data?.success) setAnalytics(anRes.data.analytics);
      if (movRes.data?.success) setMovements(movRes.data.movements || []);
    } catch (e) {
      console.log('Fetch analytics note:', e.message);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchInventory(), fetchInvoices(), fetchAnalyticsAndMovements()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [orderFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [invoiceFilter]);

  const openDispenseModal = (order) => {
    const qtyMap = {};
    (order.items || []).forEach((it) => {
      if (it.status !== 'dispensed') {
        const defaultQty = it.reserved_units > 0 ? it.reserved_units : it.prescribed_units;
        qtyMap[it.id] = String(defaultQty);
      }
    });
    setDispenseQuantities(qtyMap);
    setDispenseBilling({
      discountAmount: '0',
      taxPercent: '0',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      notes: '',
    });
    setDispenseModalOrder(order);
  };

  const computeDispensePreview = () => {
    if (!dispenseModalOrder) return { subtotal: 0, total: 0 };
    let subtotal = 0;
    for (const it of dispenseModalOrder.items || []) {
      if (it.status === 'dispensed') continue;
      const qty = Math.max(0, parseInt(dispenseQuantities[it.id] || '0', 10) || 0);
      const price = parseFloat(it.current_selling_price ?? it.unit_price ?? 0) || 0;
      subtotal += qty * price;
    }
    const discount = Math.max(0, Math.min(subtotal, parseFloat(dispenseBilling.discountAmount || '0') || 0));
    const taxable = Math.max(0, subtotal - discount);
    const taxPct = Math.max(0, parseFloat(dispenseBilling.taxPercent || '0') || 0);
    const total = taxable + (taxable * taxPct) / 100;
    return { subtotal: subtotal.toFixed(2), total: total.toFixed(2) };
  };

  const handleConfirmDispense = async () => {
    if (!dispenseModalOrder) return;
    setDispensing(true);
    try {
      const items = Object.entries(dispenseQuantities).map(([orderItemId, val]) => ({
        orderItemId: parseInt(orderItemId, 10),
        dispensedUnits: Math.max(0, parseInt(val || '0', 10) || 0),
      }));

      const res = await axios.post(`${API_URL}/pharmacy/orders/${dispenseModalOrder.id}/dispense`, {
        items,
        discountAmount: parseFloat(dispenseBilling.discountAmount || '0') || 0,
        taxPercent: parseFloat(dispenseBilling.taxPercent || '0') || 0,
        paymentStatus: dispenseBilling.paymentStatus,
        paymentMethod: dispenseBilling.paymentMethod,
        notes: dispenseBilling.notes,
      });

      if (res.data?.success) {
        Alert.alert('Dispensed', res.data.message || 'Medicines dispensed & stock updated.');
        setDispenseModalOrder(null);
        loadAll();
      }
    } catch (e) {
      Alert.alert('Cannot Dispense', e.response?.data?.message || 'Error dispensing order');
    } finally {
      setDispensing(false);
    }
  };

  const handleCancelOrder = (order) => {
    Alert.alert(
      'Cancel Pharmacy Order',
      `Cancel Rx #${order.prescription_id} for ${order.patient_name} and release reserved stock?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/pharmacy/orders/${order.id}/cancel`, {});
              loadAll();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not cancel order');
            }
          },
        },
      ]
    );
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
      cost_price: '',
      selling_price: '',
      supplier_name: '',
    });
  };

  const openAddInventoryModal = () => {
    setEditingInventoryItem(null);
    resetItemForm();
    setInventoryModalVisible(true);
  };

  const openEditInventoryModal = (item) => {
    setEditingInventoryItem(item);
    setItemForm({
      medicine_name: item.medicine_name || '',
      brand_name: item.brand_name || '',
      strength: item.strength || '',
      form: item.form || 'Tablet',
      stock_quantity: item.stock_quantity !== undefined ? String(item.stock_quantity) : '0',
      batch_number: item.batch_number || '',
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
      reorder_level: item.reorder_level !== undefined ? String(item.reorder_level) : '10',
      cost_price: item.cost_price !== null && item.cost_price !== undefined ? String(item.cost_price) : '',
      selling_price: item.selling_price !== null && item.selling_price !== undefined ? String(item.selling_price) : '',
      supplier_name: item.supplier_name || '',
    });
    setInventoryModalVisible(true);
  };

  const handleSaveInventoryItem = async () => {
    if (!itemForm.medicine_name.trim() || itemForm.stock_quantity === '') {
      return Alert.alert('Missing Fields', 'Medicine name and stock quantity are required.');
    }
    setSavingItem(true);
    try {
      const payload = {
        medicineName: itemForm.medicine_name.trim(),
        brandName: itemForm.brand_name.trim() || null,
        strength: itemForm.strength.trim() || null,
        form: itemForm.form,
        stockQuantity: parseInt(itemForm.stock_quantity || '0', 10),
        batchNumber: itemForm.batch_number.trim() || null,
        expiryDate: itemForm.expiry_date.trim() || null,
        reorderLevel: parseInt(itemForm.reorder_level || '10', 10),
        costPrice: itemForm.cost_price !== '' ? parseFloat(itemForm.cost_price) : null,
        sellingPrice: itemForm.selling_price !== '' ? parseFloat(itemForm.selling_price) : null,
        supplierName: itemForm.supplier_name.trim() || null,
      };
      if (editingInventoryItem) {
        await axios.put(`${API_URL}/inventory/${editingInventoryItem.id}`, payload);
      } else {
        await axios.post(`${API_URL}/inventory`, payload);
      }
      setInventoryModalVisible(false);
      setEditingInventoryItem(null);
      resetItemForm();
      loadAll();
    } catch (e) {
      Alert.alert('Save Error', e.response?.data?.message || 'Could not save inventory item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleQuickRestock = async (item, qty = 10) => {
    try {
      await axios.post(`${API_URL}/inventory/${item.id}/restock`, { addQuantity: qty });
      loadAll();
    } catch (e) {
      Alert.alert('Restock Error', e.response?.data?.message || 'Failed to restock');
    }
  };

  const handleDeleteInventory = (item) => {
    Alert.alert('Delete Stock Item', `Remove ${item.medicine_name} from clinic inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/inventory/${item.id}`);
            loadAll();
          } catch (e) {
            Alert.alert('Error', e.response?.data?.message || 'Could not delete item');
          }
        },
      },
    ]);
  };

  const handleMarkInvoicePaid = (invoice, method = 'cash') => {
    Alert.alert('Collect Payment', `Mark ${invoice.invoice_number} (₹${invoice.total_amount}) as Paid via ${method.toUpperCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid',
        onPress: async () => {
          try {
            await axios.patch(`${API_URL}/pharmacy/invoices/${invoice.id}/pay`, {
              paymentStatus: 'paid',
              paymentMethod: method,
            });
            loadAll();
          } catch (e) {
            Alert.alert('Error', e.response?.data?.message || 'Failed to update invoice');
          }
        },
      },
    ]);
  };

  const isDateExpired = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr) < today;
  };

  const isDateExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const d = new Date(dateStr);
    return d >= today && d <= in30;
  };

  const filteredInventory = inventoryItems.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQ =
      !q ||
      (item.medicine_name || '').toLowerCase().includes(q) ||
      (item.brand_name || '').toLowerCase().includes(q) ||
      (item.batch_number || '').toLowerCase().includes(q);
    if (!matchesQ) return false;

    const avail = item.available_quantity ?? item.stock_quantity ?? 0;
    if (invFilter === 'out') return avail <= 0;
    if (invFilter === 'low') return avail > 0 && item.stock_quantity <= (item.reorder_level ?? 10);
    if (invFilter === 'expiring') return isDateExpired(item.expiry_date) || isDateExpiringSoon(item.expiry_date);
    return true;
  });

  const warningBadgeCount =
    (analytics?.warnings?.outOfStock?.length || 0) +
    (analytics?.warnings?.lowStock?.length || 0) +
    (analytics?.warnings?.expired?.length || 0) +
    (analytics?.warnings?.expiringSoon?.length || 0);

  const pendingOrdersCount = analytics?.pendingOrdersCount ?? orders.filter((o) => o.status === 'pending').length;
  const preview = computeDispensePreview();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pharmacy & Stock Portal</Text>
          <Text style={styles.headerSub}>{userInfo?.name || 'Pharmacy Manager'}</Text>
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
            style={[styles.tabBtn, tab === 'orders' && styles.tabBtnActive]}
            onPress={() => setTab('orders')}
          >
            <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>
              📥 Dispense Queue {pendingOrdersCount > 0 ? `(${pendingOrdersCount})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'inventory' && styles.tabBtnActive]}
            onPress={() => setTab('inventory')}
          >
            <Text style={[styles.tabText, tab === 'inventory' && styles.tabTextActive]}>
              📦 Stock & Inventory
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'invoices' && styles.tabBtnActive]}
            onPress={() => setTab('invoices')}
          >
            <Text style={[styles.tabText, tab === 'invoices' && styles.tabTextActive]}>
              🧾 Invoices
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'analytics' && styles.tabBtnActive]}
            onPress={() => setTab('analytics')}
          >
            <Text style={[styles.tabText, tab === 'analytics' && styles.tabTextActive]}>
              📊 Alerts & Tracker {warningBadgeCount > 0 ? `(${warningBadgeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: DISPENSE QUEUE */}
      {tab === 'orders' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {[
              { key: 'pending', label: 'Pending' },
              { key: 'dispensed', label: 'Dispensed' },
              { key: 'all', label: 'All Orders' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, orderFilter === f.key && styles.filterPillActive]}
                onPress={() => setOrderFilter(f.key)}
              >
                <Text style={[styles.filterPillText, orderFilter === f.key && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingOrders && orders.length === 0 ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : orders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No {orderFilter === 'all' ? '' : orderFilter} prescriptions in queue</Text>
              <Text style={styles.emptySub}>
                When doctors prescribe Clinic Pharmacy medicines, orders automatically appear here for dispensing.
              </Text>
            </View>
          ) : (
            orders.map((order) => {
              const st = ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.pending;
              const isActionable = order.status === 'pending' || order.status === 'partially_dispensed';
              return (
                <View key={order.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        Rx #{order.prescription_id} • {order.patient_name}
                      </Text>
                      <Text style={styles.cardMeta}>
                        📞 {order.patient_phone} • Dr. {order.doctor_name}
                      </Text>
                      <Text style={styles.cardDate}>{new Date(order.created_at).toLocaleString()}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  </View>

                  <View style={styles.orderItemsBox}>
                    {(order.items || []).map((it) => {
                      const expired = isDateExpired(it.expiry_date);
                      return (
                        <View key={it.id} style={styles.orderItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.orderMedName}>
                              {it.medicine_name} ({it.medicine_form || 'Tablet'})
                            </Text>
                            <Text style={styles.orderMedSub}>
                              Prescribed: {it.prescribed_units} unit(s) • Reserved: {it.reserved_units} • Unreserved Stock: {it.unreserved_stock ?? 0}
                            </Text>
                            {it.batch_number ? (
                              <Text style={[styles.orderMedSub, expired && { color: '#DC2626', fontWeight: '700' }]}>
                                Batch {it.batch_number} {it.expiry_date ? `• Exp: ${it.expiry_date.split('T')[0]}` : ''} {expired ? '⚠️ EXPIRED' : ''}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 11, color: '#B91C1C', fontWeight: '700' }}>
                                ⚠️ No linked clinic stock batch found
                              </Text>
                            )}
                          </View>
                          {it.current_selling_price ? (
                            <Text style={styles.unitPriceTag}>₹{it.current_selling_price}/u</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>

                  {order.invoice_number ? (
                    <Text style={styles.invoiceRef}>
                      🧾 {order.invoice_number} • ₹{order.invoice_total} ({order.payment_status?.toUpperCase()})
                    </Text>
                  ) : null}

                  {isActionable && hasPermission('dispense_prescriptions') && (
                    <View style={styles.cardActionRow}>
                      <TouchableOpacity style={styles.primarySmallBtn} onPress={() => openDispenseModal(order)}>
                        <Text style={styles.primarySmallBtnText}>✓ Dispense & Invoice</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => handleCancelOrder(order)}>
                        <Text style={styles.cancelSmallBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 2: STOCK & INVENTORY */}
      {tab === 'inventory' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <View style={styles.toolbarRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search medicine, brand, batch..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity style={styles.addBtn} onPress={openAddInventoryModal}>
              <Text style={styles.addBtnText}>+ Add Stock</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'low', label: 'Low Stock' },
              { key: 'expiring', label: 'Expiring / Expired' },
              { key: 'out', label: 'Out of Stock' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, invFilter === f.key && styles.filterPillActive]}
                onPress={() => setInvFilter(f.key)}
              >
                <Text style={[styles.filterPillText, invFilter === f.key && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingInventory && inventoryItems.length === 0 ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : filteredInventory.length === 0 ? (
            <Text style={styles.emptySub}>No inventory items match the selected filter.</Text>
          ) : (
            filteredInventory.map((item) => {
              const avail = item.available_quantity ?? item.stock_quantity ?? 0;
              const isOut = avail <= 0;
              const isLow = !isOut && item.stock_quantity <= (item.reorder_level ?? 10);
              const expired = isDateExpired(item.expiry_date);
              const expSoon = isDateExpiringSoon(item.expiry_date);

              return (
                <View key={item.id} style={[styles.card, (isOut || expired) && styles.cardDanger, isLow && !expired && styles.cardWarn]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.cardTitle}>{item.medicine_name}</Text>
                      <Text style={styles.cardMeta}>
                        {item.brand_name ? `${item.brand_name} • ` : ''}{item.strength || ''} • {item.form}
                      </Text>
                      <Text style={styles.cardMeta}>
                        Batch: {item.batch_number || 'N/A'} • Exp: {item.expiry_date ? item.expiry_date.split('T')[0] : 'N/A'}
                      </Text>
                      {item.supplier_name ? <Text style={styles.cardMeta}>Supplier: {item.supplier_name}</Text> : null}
                      {item.selling_price ? (
                        <Text style={[styles.cardMeta, { color: COLORS.primary, fontWeight: '700' }]}>
                          Sell: ₹{item.selling_price} {item.cost_price ? `(Cost: ₹${item.cost_price})` : ''}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.bigQty, (isOut || isLow) && { color: '#DC2626' }]}>
                        {avail} <Text style={{ fontSize: 11, color: '#64748B' }}>avail</Text>
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        Total: {item.stock_quantity} • Rsv: {item.reserved_quantity || 0}
                      </Text>
                      {expired ? (
                        <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[styles.badgeText, { color: '#B91C1C' }]}>EXPIRED</Text>
                        </View>
                      ) : expSoon ? (
                        <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.badgeText, { color: '#B45309' }]}>EXPIRING SOON</Text>
                        </View>
                      ) : isOut ? (
                        <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[styles.badgeText, { color: '#B91C1C' }]}>OUT OF STOCK</Text>
                        </View>
                      ) : isLow ? (
                        <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.badgeText, { color: '#B45309' }]}>LOW STOCK</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.cardActionRow}>
                    <TouchableOpacity style={styles.primarySmallBtn} onPress={() => handleQuickRestock(item, 10)}>
                      <Text style={styles.primarySmallBtnText}>+10 Restock</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondarySmallBtn} onPress={() => openEditInventoryModal(item)}>
                      <Text style={styles.secondarySmallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => handleDeleteInventory(item)}>
                      <Text style={styles.cancelSmallBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 3: INVOICES */}
      {tab === 'invoices' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all', label: 'All Invoices' },
              { key: 'unpaid', label: 'Unpaid' },
              { key: 'paid', label: 'Paid' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, invoiceFilter === f.key && styles.filterPillActive]}
                onPress={() => setInvoiceFilter(f.key)}
              >
                <Text style={[styles.filterPillText, invoiceFilter === f.key && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingInvoices && invoices.length === 0 ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : invoices.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No invoices generated yet</Text>
              <Text style={styles.emptySub}>Invoices are generated automatically whenever prescriptions are dispensed.</Text>
            </View>
          ) : (
            invoices.map((inv) => {
              const isPaid = inv.payment_status === 'paid';
              return (
                <View key={inv.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{inv.invoice_number}</Text>
                      <Text style={styles.cardMeta}>{inv.patient_name} • 📞 {inv.patient_phone}</Text>
                      <Text style={styles.cardDate}>{new Date(inv.created_at).toLocaleString()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.bigQty}>₹{inv.total_amount}</Text>
                      <View style={[styles.badge, { backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7' }]}>
                        <Text style={[styles.badgeText, { color: isPaid ? '#15803D' : '#B45309' }]}>
                          {isPaid ? `PAID (${(inv.payment_method || 'cash').toUpperCase()})` : 'UNPAID'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.orderItemsBox}>
                    {(inv.items || []).map((line) => (
                      <View key={line.id} style={styles.invoiceLineRow}>
                        <Text style={{ fontSize: 12, color: '#334155', flex: 1 }}>
                          {line.medicine_name} × {line.quantity}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                          ₹{line.line_total}
                        </Text>
                      </View>
                    ))}
                    {(parseFloat(inv.discount_amount) > 0 || parseFloat(inv.tax_amount) > 0) && (
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                        Subtotal ₹{inv.subtotal} • Discount -₹{inv.discount_amount} • Tax +₹{inv.tax_amount}
                      </Text>
                    )}
                  </View>

                  {!isPaid && hasPermission('generate_invoices') && (
                    <View style={styles.cardActionRow}>
                      <TouchableOpacity style={styles.primarySmallBtn} onPress={() => handleMarkInvoicePaid(inv, 'cash')}>
                        <Text style={styles.primarySmallBtnText}>Mark Paid (Cash)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondarySmallBtn} onPress={() => handleMarkInvoicePaid(inv, 'upi')}>
                        <Text style={styles.secondarySmallBtnText}>Mark Paid (UPI)</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 4: ALERTS & TRACKER */}
      {tab === 'analytics' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
        >
          {loadingAnalytics && !analytics ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : analytics ? (
            <>
              <Text style={styles.sectionTitle}>Valuation & Revenue</Text>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiVal}>₹{analytics.valuation.total_retail_value.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>Stock Retail Value ({analytics.valuation.total_units}u)</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiVal}>₹{analytics.revenue.paid_revenue.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>Total Collected Revenue</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={[styles.kpiVal, { color: '#0369A1' }]}>₹{analytics.revenue.today_revenue.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>Today's Sales</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={[styles.kpiVal, { color: '#B45309' }]}>₹{analytics.revenue.unpaid_pending.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>Unpaid Bills</Text>
                </View>
              </View>

              {/* Depletion / Completion Forecast */}
              {analytics.warnings.depletionForecast?.length > 0 && (
                <View style={styles.warningSection}>
                  <Text style={styles.sectionTitle}>⏳ Completion / Run-Out Forecast (&le; 14 Days)</Text>
                  {analytics.warnings.depletionForecast.map((f) => (
                    <View key={f.id} style={styles.warnRow}>
                      <Text style={styles.warnName}>{f.medicine_name} {f.strength || ''}</Text>
                      <Text style={styles.warnHighlight}>
                        ~{f.estimated_days_left}d left ({f.available_quantity}u @ {f.daily_rate}/day)
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Expired / Expiring Soon / Low / Out of Stock */}
              {analytics.warnings.expired?.length > 0 && (
                <View style={[styles.warningSection, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.sectionTitle, { color: '#B91C1C' }]}>
                    🚫 Expired Stock ({analytics.warnings.expired.length})
                  </Text>
                  {analytics.warnings.expired.map((it) => (
                    <Text key={it.id} style={styles.warnItemText}>
                      • {it.medicine_name} (Batch {it.batch_number || 'N/A'}) — Exp {it.expiry_date?.split('T')[0]} ({it.stock_quantity}u)
                    </Text>
                  ))}
                </View>
              )}

              {analytics.warnings.expiringSoon?.length > 0 && (
                <View style={[styles.warningSection, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.sectionTitle, { color: '#92400E' }]}>
                    ⚠️ Expiring Within 30 Days ({analytics.warnings.expiringSoon.length})
                  </Text>
                  {analytics.warnings.expiringSoon.map((it) => (
                    <Text key={it.id} style={styles.warnItemText}>
                      • {it.medicine_name} (Batch {it.batch_number || 'N/A'}) — Exp {it.expiry_date?.split('T')[0]} ({it.stock_quantity}u)
                    </Text>
                  ))}
                </View>
              )}

              {(analytics.warnings.outOfStock?.length > 0 || analytics.warnings.lowStock?.length > 0) && (
                <View style={styles.warningSection}>
                  <Text style={styles.sectionTitle}>
                    📉 Low / Out of Stock ({analytics.warnings.outOfStock.length + analytics.warnings.lowStock.length})
                  </Text>
                  {analytics.warnings.outOfStock.map((it) => (
                    <Text key={`out-${it.id}`} style={[styles.warnItemText, { color: '#B91C1C', fontWeight: '700' }]}>
                      • OUT OF STOCK: {it.medicine_name} {it.strength || ''}
                    </Text>
                  ))}
                  {analytics.warnings.lowStock.map((it) => (
                    <Text key={`low-${it.id}`} style={styles.warnItemText}>
                      • LOW ({it.stock_quantity}/{it.reorder_level}): {it.medicine_name} {it.strength || ''}
                    </Text>
                  ))}
                </View>
              )}

              {analytics.topDispensed?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>🔥 Top Dispensed (Last 30 Days)</Text>
                  {analytics.topDispensed.map((td, idx) => (
                    <View key={idx} style={styles.warnRow}>
                      <Text style={styles.warnName}>{td.medicine_name} {td.strength || ''}</Text>
                      <Text style={{ fontWeight: '800', color: COLORS.primary }}>{td.total_dispensed} units</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recent Stock Movement Ledger</Text>
              {movements.length === 0 ? (
                <Text style={styles.emptySub}>No stock movements recorded yet.</Text>
              ) : (
                movements.map((m) => (
                  <View key={m.id} style={styles.movementItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.movTitle}>
                        {m.movement_type.toUpperCase()} • {m.medicine_name}
                      </Text>
                      <Text style={[styles.movQty, { color: m.quantity_change < 0 ? '#DC2626' : '#15803D' }]}>
                        {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                      </Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {m.notes || ''} {m.actor_name ? `• By ${m.actor_name}` : ''}
                    </Text>
                    <Text style={styles.cardDate}>{new Date(m.created_at).toLocaleString()}</Text>
                  </View>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* DISPENSE & INVOICE MODAL */}
      <Modal visible={!!dispenseModalOrder} transparent animationType="slide" onRequestClose={() => setDispenseModalOrder(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Dispense & Invoice</Text>
                <Text style={styles.cardMeta}>
                  Rx #{dispenseModalOrder?.prescription_id} • {dispenseModalOrder?.patient_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDispenseModalOrder(null)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {(dispenseModalOrder?.items || []).map((it) => {
                if (it.status === 'dispensed') return null;
                return (
                  <View key={it.id} style={styles.dispenseLineCard}>
                    <Text style={styles.orderMedName}>{it.medicine_name}</Text>
                    <Text style={styles.orderMedSub}>
                      Prescribed: {it.prescribed_units} • Price: ₹{it.current_selling_price ?? it.unit_price ?? 0}/unit
                    </Text>
                    <Text style={styles.inputLabel}>Units to Dispense</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      value={dispenseQuantities[it.id] || '0'}
                      onChangeText={(v) => setDispenseQuantities((p) => ({ ...p, [it.id]: v.replace(/[^0-9]/g, '') }))}
                    />
                  </View>
                );
              })}

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Discount (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={dispenseBilling.discountAmount}
                    onChangeText={(v) => setDispenseBilling((p) => ({ ...p, discountAmount: v }))}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Tax (%)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={dispenseBilling.taxPercent}
                    onChangeText={(v) => setDispenseBilling((p) => ({ ...p, taxPercent: v }))}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Payment Status</Text>
              <View style={styles.rolePickRow}>
                {[
                  { key: 'paid', label: 'Paid Now' },
                  { key: 'unpaid', label: 'Pay Later (Unpaid)' },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.rolePickChip, dispenseBilling.paymentStatus === s.key && styles.rolePickChipActive]}
                    onPress={() => setDispenseBilling((p) => ({ ...p, paymentStatus: s.key }))}
                  >
                    <Text style={[styles.rolePickText, dispenseBilling.paymentStatus === s.key && styles.rolePickTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {dispenseBilling.paymentStatus === 'paid' && (
                <>
                  <Text style={styles.inputLabel}>Payment Method</Text>
                  <View style={styles.rolePickRow}>
                    {['cash', 'upi', 'card'].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.rolePickChip, dispenseBilling.paymentMethod === m && styles.rolePickChipActive]}
                        onPress={() => setDispenseBilling((p) => ({ ...p, paymentMethod: m }))}
                      >
                        <Text style={[styles.rolePickText, dispenseBilling.paymentMethod === m && styles.rolePickTextActive]}>
                          {m.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Subtotal: ₹{preview.subtotal}</Text>
                <Text style={styles.totalBig}>Final Invoice Total: ₹{preview.total}</Text>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmDispense} disabled={dispensing}>
                {dispensing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Confirm Dispense & Generate Invoice</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ADD / EDIT STOCK MODAL */}
      <Modal visible={inventoryModalVisible} transparent animationType="slide" onRequestClose={() => setInventoryModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingInventoryItem ? 'Edit Stock Item' : 'Add Pharmacy Stock'}</Text>
              <TouchableOpacity onPress={() => setInventoryModalVisible(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
              <Text style={styles.inputLabel}>Medicine Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Dolo 650"
                placeholderTextColor="#64748B"
                value={itemForm.medicine_name}
                onChangeText={(v) => setItemForm((p) => ({ ...p, medicine_name: v }))}
              />

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Brand</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Micro Labs"
                    placeholderTextColor="#64748B"
                    value={itemForm.brand_name}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, brand_name: v }))}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Strength / Pack Size</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="650mg (15 tabs)"
                    placeholderTextColor="#64748B"
                    value={itemForm.strength}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, strength: v }))}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Form</Text>
                  <View style={styles.pickerBox}>
                    <Picker
                      selectedValue={itemForm.form}
                      onValueChange={(v) => setItemForm((p) => ({ ...p, form: v }))}
                      style={{ color: '#0F172A' }}
                    >
                      <Picker.Item label="Tablet" value="Tablet" />
                      <Picker.Item label="Capsule" value="Capsule" />
                      <Picker.Item label="Syrup" value="Syrup" />
                      <Picker.Item label="Injection" value="Injection" />
                      <Picker.Item label="Ointment" value="Ointment" />
                      <Picker.Item label="Drops" value="Drops" />
                    </Picker>
                  </View>
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Stock Quantity *</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor="#64748B"
                    value={itemForm.stock_quantity}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, stock_quantity: v }))}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Batch Number</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="B-2026"
                    placeholderTextColor="#64748B"
                    value={itemForm.batch_number}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, batch_number: v }))}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Expiry (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="2027-08-31"
                    placeholderTextColor="#64748B"
                    value={itemForm.expiry_date}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, expiry_date: v }))}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Cost Price (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="22.00"
                    placeholderTextColor="#64748B"
                    value={itemForm.cost_price}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, cost_price: v }))}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Selling Price (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="35.00"
                    placeholderTextColor="#64748B"
                    value={itemForm.selling_price}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, selling_price: v }))}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Reorder Warning Level</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor="#64748B"
                    value={itemForm.reorder_level}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, reorder_level: v }))}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.inputLabel}>Supplier Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Apollo Distributors"
                    placeholderTextColor="#64748B"
                    value={itemForm.supplier_name}
                    onChangeText={(v) => setItemForm((p) => ({ ...p, supplier_name: v }))}
                  />
                </View>
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={handleSaveInventoryItem} disabled={savingItem}>
                {savingItem ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Save Stock Item</Text>}
              </TouchableOpacity>
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
  logoutBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  logoutText: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
  tabWrapper: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
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
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    ...SHADOWS.small,
  },
  cardWarn: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  cardDanger: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cardMeta: { fontSize: 12, color: '#475569', marginTop: 2 },
  cardDate: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  bigQty: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  orderItemsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  orderMedName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  orderMedSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  unitPriceTag: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginLeft: 8 },
  invoiceRef: { fontSize: 12, color: '#15803D', fontWeight: '700', marginTop: 8 },
  invoiceLineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  cardActionRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  primarySmallBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primarySmallBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  secondarySmallBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  secondarySmallBtnText: { color: '#3730A3', fontSize: 12, fontWeight: '700' },
  cancelSmallBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  cancelSmallBtnText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 24, alignItems: 'center', ...SHADOWS.small },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  kpiVal: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 3 },
  warningSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  warnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  warnName: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  warnHighlight: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  warnItemText: { fontSize: 12, color: '#334155', marginBottom: 4 },
  movementItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  movTitle: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  movQty: { fontSize: 13, fontWeight: '800' },
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
  dispenseLineCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
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
  totalBox: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 12, color: '#0F766E', fontWeight: '600' },
  totalBig: { fontSize: 18, color: COLORS.primary, fontWeight: '800', marginTop: 3 },
  primaryBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

