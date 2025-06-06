import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Text, ScrollView, ActivityIndicator, Platform, TouchableOpacity, Alert, Switch } from 'react-native';
import { Button, Card, TextInput, useTheme } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';

// const BASE_URL = 'http://localhost:5000';
// const BASE_URL = 'https://barcodescane-backend.onrender.com';
const BASE_URL = 'http://52.72.238.42:5002';

const isWeb = Platform.OS === 'web';

export default function SuperAdminDashboard({ navigation }) {
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);

  // State Declarations
  const [admins, setAdmins] = useState([]);
  const [users, setUsers] = useState([]);
  const [barcodes, setBarcodes] = useState([]);
  const [searchAdmin, setSearchAdmin] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [showPassword, setShowPassword] = useState(null);
  const [passwordAdminId, setPasswordAdminId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState('home');
  const [superAdmin, setSuperAdmin] = useState(null);
  const [selectedAdminId, setSelectedAdminId] = useState(null);
  const [userBarcodes, setUserBarcodes] = useState([]);
  const [barcodeSettings, setBarcodeSettings] = useState({
    prefix: 'OPT',
    startNumber: '1',
    count: '50',
    companyName: '',
    digitCount: '7',
    mode: 'with-outline',
  });
  const [selectedAdminForUser, setSelectedAdminForUser] = useState('');
  const [useAdminRanges, setUseAdminRanges] = useState(false);
  const [selectedRangeId, setSelectedRangeId] = useState('');
  const [adminRanges, setAdminRanges] = useState([]);
  const [pointsPerScan, setPointsPerScan] = useState('50');

  // useCallback Functions (in Dependency Order)
  const showConfirmDialog = useCallback((title, message, onConfirm) => {
    if (isWeb) {
      if (window.confirm(`${title}\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: title.includes('Delete') ? 'Delete' : 'Confirm', style: 'destructive', onPress: onConfirm },
      ]);
    }
  }, [isWeb]);

  const handleUnauthorized = useCallback(async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.clear();
      navigation.replace('Home');
      Toast.show({ type: 'error', text1: 'Session Expired' });
      return true;
    }
    return false;
  }, [navigation]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token found');
      const [usersRes, barcodesRes, adminsRes] = await Promise.all([
        axios.get(`${BASE_URL}/users`, { headers: { Authorization: token } }),
        axios.get(`${BASE_URL}/barcodes`, { headers: { Authorization: token } }),
        axios.get(`${BASE_URL}/admins`, { headers: { Authorization: token } }),
      ]);
      const validUsers = usersRes.data.filter(user => user.name && user.mobile);
      const sortedUsers = validUsers.sort((a, b) => {
        if (a.status === 'approved' && b.status === 'approved') return b.points - a.points;
        if (a.status === 'approved') return -1;
        if (b.status === 'approved') return 1;
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return 0;
      });
      setUsers(sortedUsers.filter(user => user.role === 'user'));
      setAdmins(adminsRes.data.map(admin => ({ id: admin._id, name: admin.name, mobile: admin.mobile, status: admin.status, uniqueCode: admin.uniqueCode })));
      setBarcodes(barcodesRes.data);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({
        type: 'error',
        text1: 'Fetch Failed',
        text2: error.response?.data?.message || 'Could not load data.',
      });
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  const fetchAdminRanges = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token found');
      const response = await axios.get(`${BASE_URL}/barcode-ranges`, {
        headers: { Authorization: token },
      });
      setAdminRanges(response.data);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({
        type: 'error',
        text1: 'Fetch Failed',
        text2: error.response?.data?.message || 'Could not fetch admin ranges.',
      });
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  const handleViewAdminPassword = useCallback((adminId) => {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(adminId);
    if (!isValidObjectId) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Admin ID',
        text2: `Admin ID ${adminId} is not in a valid format`,
      });
      return;
    }
    showConfirmDialog('View Password', 'Are you sure you want to view this admin\'s password? This is a sensitive operation.', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('No token found');
        const response = await axios.get(`${BASE_URL}/admins/${adminId}/password`, { 
          headers: { Authorization: token } 
        });
        setShowPassword(response.data.password);
        setPasswordAdminId(adminId);
        Toast.show({ type: 'success', text1: 'Password Retrieved' });
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        const errorMessage = error.response?.data?.message || `Failed to fetch password for admin ${adminId}`;
        Toast.show({ 
          type: 'error', 
          text1: 'Fetch Password Failed', 
          text2: errorMessage 
        });
      } finally {
        setLoading(false);
      }
    });
  }, [handleUnauthorized, showConfirmDialog]);

  const handleStatusUpdate = useCallback(async (userId, status) => {
    if (status === 'approved' && !selectedAdminForUser) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please select an admin before approving.' });
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/users/${userId}/status`,
        { status, adminId: status === 'approved' ? selectedAdminForUser : undefined },
        { headers: { Authorization: token } }
      );
      Toast.show({ type: 'success', text1: 'Status Updated' });
      setSelectedAdminForUser('');
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.response?.data?.message || 'Could not update status.' });
    } finally {
      setLoading(false);
    }
  }, [fetchData, handleUnauthorized, selectedAdminForUser]);

  const handleStatusUpdateAdmin = useCallback(async (adminId, status) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token found');
      const response = await axios.put(
        `${BASE_URL}/admins/${adminId}/status`,
        { status },
        { headers: { Authorization: token } }
      );
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: `Admin ${status} successfully`,
      });
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.response?.data?.message || 'Failed to update admin status',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchData, handleUnauthorized]);

  const handleDeleteAdmin = useCallback((adminId) => {
    showConfirmDialog('Confirm Delete', 'Delete this admin?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/users/${adminId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Admin Deleted' });
        await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed', text2: error.response?.data?.message || 'Could not delete admin.' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, showConfirmDialog]);

  const handleSetAdminUserLimit = useCallback(async (adminId, limit) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(`${BASE_URL}/admins/${adminId}/user-limit`, { userLimit: parseInt(limit) }, { headers: { Authorization: token } });
      Toast.show({ type: 'success', text1: 'User Limit Updated' });
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.response?.data?.message || 'Could not update user limit.' });
    } finally {
      setLoading(false);
    }
  }, [fetchData, handleUnauthorized]);

  const fetchUserBarcodes = useCallback(async (userId) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${BASE_URL}/barcodes/user/${userId}`, { headers: { Authorization: token } });
      setUserBarcodes(response.data);
      setSelectedAdminId(userId);
      if (!response.data.length) Toast.show({ type: 'info', text1: 'No Barcodes' });
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Fetch Failed', text2: error.response?.data?.message || 'Could not fetch barcodes.' });
      setUserBarcodes([]);
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  const handleDeleteUser = useCallback((userId) => {
    showConfirmDialog('Confirm Delete', 'Delete this user?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/users/${userId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'User Deleted' });
        await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed', text2: error.response?.data?.message || 'Could not delete user.' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, showConfirmDialog]);

  const handleDeleteBarcode = useCallback((barcodeId) => {
    showConfirmDialog('Confirm Delete', 'Delete this barcode?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/barcodes/${barcodeId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Barcode Deleted' });
        if (selectedAdminId) await fetchUserBarcodes(selectedAdminId);
        else await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed', text2: error.response?.data?.message || 'Could not delete barcode.' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, fetchUserBarcodes, handleUnauthorized, selectedAdminId, showConfirmDialog]);

  const handleResetPoints = useCallback((userId) => {
    showConfirmDialog('Confirm Reset Points', 'Reset user points?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.put(`${BASE_URL}/users/${userId}/reset-points`, {}, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Points Reset' });
        await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Reset Failed', text2: error.response?.data?.message || 'Could not reset points.' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, showConfirmDialog]);

  const handleLogout = useCallback(async () => {
    try {
      await AsyncStorage.clear();
      navigation.replace('Home');
      Toast.show({ type: 'success', text1: 'Logged Out' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Logout Failed', text2: error.message });
    }
  }, [navigation]);

  const generateBarcodePDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token found');
      const response = await axios.post(
        `${BASE_URL}/generate-pdf`,
        {
          barcodeSettings: {
            ...barcodeSettings,
            pointsPerScan,
          },
          useAdminRanges,
          selectedRangeId: useAdminRanges ? selectedRangeId : undefined,
          selectedAdminForUser: useAdminRanges ? selectedAdminForUser : undefined,
          adminRanges,
        },
        { headers: { Authorization: token } }
      );
      const { pdf } = response.data;
      if (Platform.OS === 'web') {
        const downloadPDF = () => {
          try {
            const byteCharacters = atob(pdf);
            const byteArray = new Uint8Array([...byteCharacters].map((c) => c.charCodeAt(0)));
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'barcodes.pdf';
            link.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            console.error('Web PDF Download Error:', err);
            throw new Error('Failed to download PDF on web');
          }
        };
        downloadPDF();
      } else {
        const fileUri = `${FileSystem.documentDirectory}barcodes.pdf`;
        await FileSystem.writeAsStringAsync(fileUri, pdf, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf' });
      }
      Toast.show({ type: 'success', text1: 'PDF Generated' });
    } catch (error) {
      console.error('PDF Generation Error:', error);
      Toast.show({
        type: 'error',
        text1: 'PDF Generation Failed',
        text2: error.response?.data?.message || error.message,
      });
    } finally {
      setPdfLoading(false);
    }
  }, [barcodeSettings, useAdminRanges, selectedRangeId, selectedAdminForUser, pointsPerScan, adminRanges]);

  // useMemo Hooks
  const filteredAdmins = useMemo(() => admins.filter(
    (admin) => (admin.name || '').toLowerCase().includes(searchAdmin.toLowerCase()) || 
              (admin.mobile || '').toLowerCase().includes(searchAdmin.toLowerCase()) || 
              (admin.uniqueCode || '').toLowerCase().includes(searchAdmin.toLowerCase())
  ), [admins, searchAdmin]);

  const filteredUsers = useMemo(() => users.filter(
    (user) => (user.name || '').toLowerCase().includes(searchUser.toLowerCase()) || 
              (user.mobile || '').toLowerCase().includes(searchUser.toLowerCase())
  ), [users, searchUser]);

  const filteredBarcodes = useMemo(() => barcodes.filter(
    (barcode) => (barcode.value || '').toLowerCase().includes(searchBarcode.toLowerCase())
  ), [barcodes, searchBarcode]);

  const getItemLayout = useCallback((data, index) => ({ length: 250, offset: 250 * index, index }), []);

  // useEffect and Other Hooks
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      gestureEnabled: false,
    });
  }, [navigation]);

  useEffect(() => {
    const refreshToken = async () => {
      try {
        const credentials = await AsyncStorage.getItem('credentials');
        if (!credentials) return;
        const { mobile, password } = JSON.parse(credentials);
        const response = await axios.post(`${BASE_URL}/login`, { mobile, password });
        await AsyncStorage.setItem('token', response.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        Toast.show({ type: 'success', text1: 'Session Refreshed' });
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Session Refresh Failed' });
        await AsyncStorage.clear();
        navigation.replace('Home');
      }
    };
    const interval = setInterval(refreshToken, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [navigation]);

  useEffect(() => {
    const fetchSuperAdmin = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) setSuperAdmin(JSON.parse(storedUser));
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Super Admin Data Fetch Failed' });
      }
    };
    fetchSuperAdmin();
    fetchData();
  }, [fetchData]);

  //working all done

  useEffect(() => {
    // Initial fetch
    if (currentTab === 'barcode') {
      fetchAdminRanges({ silent: false }); // show loader only initially
    }

    // Periodic background refresh
    const refreshInterval = setInterval(() => {
      fetchData(); // assume it’s lightweight or silent

      if (currentTab === 'barcode') {
        fetchAdminRanges({ silent: true }); // silent = no loading spinner
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, [currentTab, fetchData, fetchAdminRanges]);


  useEffect(() => {
    // Reset selectedRangeId when selectedAdminForUser changes
    if (useAdminRanges) {
      setSelectedRangeId('');
    }
  }, [selectedAdminForUser, useAdminRanges]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') {
        const onBackPress = () => {
          navigation.navigate('SuperAdminDashboard');
          return true;
        };
        BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      }
    }, [navigation])
  );

  // Render Logic
  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return (
          <>
            <View style={styles.header}>
              <ThemeToggle style={styles.toggle} />
              <Button mode="contained" onPress={handleLogout} style={styles.button} buttonColor={colors.error} textColor="#FFF" labelStyle={styles.buttonLabel}>
                Logout
              </Button>
            </View>
            <View style={styles.header}>
              <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Super Admin Home</Text>
            </View>
            <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
              <Card.Content>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text }]}>Super Admin: {superAdmin?.name || 'Unknown'}</Text>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Admins: {admins.length}</Text>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Users: {users.length}</Text>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Barcodes: {barcodes.length}</Text>
              </Card.Content>
            </Card>
          </>
        );
      case 'admins':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Admins</Text>
            <View style={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}>
              <TextInput
                placeholder="Search Admins"
                value={searchAdmin}
                onChangeText={setSearchAdmin}
                style={[styles.searchInput, { color: isDarkMode ? '#FFF' : colors.text }]}
                placeholderTextColor={isDarkMode ? '#AAA' : '#666'}
                autoCapitalize="none"
              />
            </View>
            <FlatList
              data={filteredAdmins}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    {selectedAdminId !== item.id ? (
                      <>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text }]}>Name: {item.name}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Mobile: {item.mobile}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Unique Code: {item.uniqueCode}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Status: {item.status === 'approved' ? 'Active' : item.status}</Text>
                        {passwordAdminId === item.id && showPassword && (
                          <View style={styles.passwordContainer}>
                            <Text style={[styles.cardText, { color: colors.error, fontWeight: 'bold' }]}>
                              Warning: Passwords are sensitive!
                            </Text>
                            <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>
                              Password: {showPassword}
                            </Text>
                            <Button
                              mode="text"
                              onPress={() => {
                                setShowPassword(null);
                                setPasswordAdminId(null);
                              }}
                              textColor={isDarkMode ? '#FF5555' : colors.error}
                            >
                              Hide
                            </Button>
                          </View>
                        )}
                        <View style={styles.buttonRow}>
                          {item.status === 'pending' ? (
                            <>
                              <Button
                                mode="contained"
                                onPress={() => handleStatusUpdateAdmin(item.id, 'approved')}
                                style={styles.actionButton}
                                buttonColor={colors.primary}
                                textColor={isDarkMode ? '#FFF' : '#212121'}
                                labelStyle={styles.buttonLabel}
                              >
                                Approve
                              </Button>
                              <Button
                                mode="contained"
                                onPress={() => handleStatusUpdateAdmin(item.id, 'disapproved')}
                                style={styles.actionButton}
                                buttonColor={colors.error}
                                textColor="#FFF"
                                labelStyle={styles.buttonLabel}
                              >
                                Disapprove
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteAdmin(item.id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                            </>
                          ) : item.status === 'disapproved' ? (
                            <Button
                              mode="outlined"
                              onPress={() => handleDeleteAdmin(item.id)}
                              style={styles.actionButton}
                              textColor={isDarkMode ? '#FF5555' : colors.error}
                              labelStyle={styles.buttonLabel}
                            >
                              Delete
                            </Button>
                          ) : (
                            <>
                              <Button
                                mode="outlined"
                                onPress={() => Toast.show({ type: 'info', text1: 'Not Available', text2: 'Barcodes are not applicable for admins.' })}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#00FF00' : colors.accent}
                                labelStyle={styles.buttonLabel}
                              >
                                View Barcodes
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteAdmin(item.id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => {
                                  const limit = isWeb ? prompt('Enter user limit:') : Alert.prompt('Set User Limit', 'Enter user limit:', (text) => text);
                                  if (limit && !isNaN(limit)) handleSetAdminUserLimit(item.id, limit);
                                }}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FFD700' : colors.accent}
                                labelStyle={styles.buttonLabel}
                              >
                                Set Limit
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleViewAdminPassword(item.id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FFD700' : colors.accent}
                                labelStyle={styles.buttonLabel}
                              >
                                View Password
                              </Button>
                            </>
                          )}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Barcodes of {item.name}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Total: {userBarcodes.length}</Text>
                        <FlatList
                          data={userBarcodes}
                          keyExtractor={(barcode) => barcode._id}
                          renderItem={({ item: barcode }) => (
                            <View style={styles.barcodeItem}>
                              <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text, flex: 1 }]}>{barcode.value} - {new Date(barcode.createdAt).toLocaleString()} - Points: {barcode.pointsAwarded}</Text>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteBarcode(barcode._id)}
                                style={[styles.actionButton, { minWidth: 80 }]}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                            </View>
                          )}
                          ListEmptyComponent={() => (
                            <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : colors.text }]}>No barcodes found.</Text>
                          )}
                          initialNumToRender={10}
                          maxToRenderPerBatch={10}
                          windowSize={5}
                          getItemLayout={getItemLayout}
                        />
                        <Button
                          mode="contained"
                          onPress={() => setSelectedAdminId(null)}
                          style={styles.button}
                          buttonColor={colors.primary}
                          textColor={isDarkMode ? '#FFF' : '#212121'}
                          labelStyle={styles.buttonLabel}
                        >
                          Back
                        </Button>
                      </>
                    )}
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={() => (
                <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : colors.text }]}>No admins found.</Text>
              )}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={getItemLayout}
            />
          </>
        );
      case 'users':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Users</Text>
            <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
              <Picker
                selectedValue={selectedAdminForUser}
                onValueChange={(itemValue) => setSelectedAdminForUser(itemValue)}
                style={[styles.picker, { color: isDarkMode ? '#FFF' : colors.text }]}
                dropdownIconColor={isDarkMode ? '#FFF' : colors.text}
              >
                <Picker.Item label="Select Admin" value="" />
                {admins.map((admin) => (
                  <Picker.Item key={admin.id} label={admin.name} value={admin.id} />
                ))}
              </Picker>
            </View>
            <View style={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}>
              <TextInput
                placeholder="Search Users"
                value={searchUser}
                onChangeText={setSearchUser}
                style={[styles.searchInput, { color: isDarkMode ? '#FFF' : colors.text }]}
                placeholderTextColor={isDarkMode ? '#AAA' : '#666'}
                autoCapitalize="none"
              />
            </View>
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    {selectedAdminId !== item._id ? (
                      <>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text }]}>Name: {item.name}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Mobile: {item.mobile}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Status: {item.status === 'approved' ? 'Active' : item.status}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Points: {item.points}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Assigned Admin: {admins.find(admin => admin.id === item.adminId)?.name || 'None'}</Text>
                        <View style={styles.buttonRow}>
                          {item.status === 'pending' ? (
                            <>
                              <Button
                                mode="contained"
                                onPress={() => handleStatusUpdate(item._id, 'approved')}
                                style={styles.actionButton}
                                buttonColor={colors.primary}
                                textColor={isDarkMode ? '#FFF' : '#212121'}
                                labelStyle={styles.buttonLabel}
                                disabled={!selectedAdminForUser}
                              >
                                Approve
                              </Button>
                              <Button
                                mode="contained"
                                onPress={() => handleStatusUpdate(item._id, 'disapproved')}
                                style={styles.actionButton}
                                buttonColor={colors.error}
                                textColor="#FFF"
                                labelStyle={styles.buttonLabel}
                              >
                                Disapprove
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteUser(item._id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                            </>
                          ) : item.status === 'disapproved' ? (
                            <Button
                              mode="outlined"
                              onPress={() => handleDeleteUser(item._id)}
                              style={styles.actionButton}
                              textColor={isDarkMode ? '#FF5555' : colors.error}
                              labelStyle={styles.buttonLabel}
                            >
                              Delete
                            </Button>
                          ) : (
                            <>
                              <Button
                                mode="outlined"
                                onPress={() => fetchUserBarcodes(item._id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#00FF00' : colors.accent}
                                labelStyle={styles.buttonLabel}
                              >
                                View Barcodes
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteUser(item._id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                              <Button
                                mode="outlined"
                                onPress={() => handleResetPoints(item._id)}
                                style={styles.actionButton}
                                textColor={isDarkMode ? '#FFD700' : colors.accent}
                                labelStyle={styles.buttonLabel}
                              >
                                Reset Points
                              </Button>
                            </>
                          )}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Barcodes of {item.name}</Text>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text }]}>Total: {userBarcodes.length}</Text>
                        <FlatList
                          data={userBarcodes}
                          keyExtractor={(barcode) => barcode._id}
                          renderItem={({ item: barcode }) => (
                            <View style={styles.barcodeItem}>
                              <Text style={[styles.cardText, { color: isDarkMode ? '#FFF' : colors.text, flex: 1 }]}>{barcode.value} - {barcode.createdAt ? new Date(barcode.createdAt).toLocaleString() : 'N/A'} - Points: {barcode.pointsAwarded ?? 0}</Text>
                              <Button
                                mode="outlined"
                                onPress={() => handleDeleteBarcode(barcode._id)}
                                style={[styles.actionButton, { minWidth: 80 }]}
                                textColor={isDarkMode ? '#FF5555' : colors.error}
                                labelStyle={styles.buttonLabel}
                              >
                                Delete
                              </Button>
                            </View>
                          )}
                          ListEmptyComponent={() => (
                            <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : colors.text }]}>No barcodes found.</Text>
                          )}
                          initialNumToRender={10}
                          maxToRenderPerBatch={10}
                          windowSize={5}
                          getItemLayout={getItemLayout}
                        />
                        <Button
                          mode="contained"
                          onPress={() => setSelectedAdminId(null)}
                          style={styles.button}
                          buttonColor={colors.primary}
                          textColor={isDarkMode ? '#FFF' : '#212121'}
                          labelStyle={styles.buttonLabel}
                        >
                          Back
                        </Button>
                      </>
                    )}
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={() => (
                <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : colors.text }]}>No users found.</Text>
              )}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={getItemLayout}
            />
          </>
        );
      case 'barcode':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFF' : colors.text }]}>Barcode Generator</Text>
            <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
              <Card.Title title="Barcode Settings" titleStyle={[styles.cardTitle, { color: isDarkMode ? '#FFF' : colors.text }]} />
              <Card.Content>
                <View style={styles.switchContainer}>
                  <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Use Admin-Defined Ranges</Text>
                  <Switch
                    value={useAdminRanges}
                    onValueChange={(value) => {
                      setUseAdminRanges(value);
                      if (!value) {
                        setSelectedAdminForUser('');
                        setSelectedRangeId('');
                      }
                    }}
                    trackColor={{ false: '#767577', true: colors.primary }}
                    thumbColor={useAdminRanges ? '#f4f3f4' : '#f4f3f4'}
                  />
                </View>
                {useAdminRanges ? (
                  <>
                    <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
                      <Picker
                        selectedValue={selectedAdminForUser}
                        onValueChange={(itemValue) => {
                          setSelectedAdminForUser(itemValue);
                          setSelectedRangeId(''); // Reset range when admin changes
                        }}
                        style={[styles.picker, { color: isDarkMode ? '#FFF' : colors.text }]}
                        dropdownIconColor={isDarkMode ? '#FFF' : colors.text}
                      >
                        <Picker.Item label="Select Admin" value="" />
                        {admins.map((admin) => (
                          <Picker.Item key={admin.id} label={admin.name} value={admin.id} />
                        ))}
                      </Picker>
                    </View>
                    <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
                      <Picker
                        selectedValue={selectedRangeId}
                        onValueChange={(itemValue) => setSelectedRangeId(itemValue)}
                        style={[styles.picker, { color: isDarkMode ? '#FFF' : colors.text }]}
                        dropdownIconColor={isDarkMode ? '#FFF' : colors.text}
                        enabled={!!selectedAdminForUser} // Disable until admin is selected
                      >
                        <Picker.Item label="Select Range" value="" />
                        {adminRanges
                          .filter(range => range.adminId?._id === selectedAdminForUser || range.adminId === selectedAdminForUser)
                          .map((range) => (
                            <Picker.Item
                              key={range._id}
                              label={`${range.start} - ${range.end} (Points: ${range.points})`}
                              value={range._id}
                            />
                          ))}
                      </Picker>
                    </View>
                    <TextInput
                      label="Company Name"
                      value={barcodeSettings.companyName}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, companyName: text.toUpperCase() })}
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Company name above barcode</Text>
                  </>
                ) : (
                  <>
                    <TextInput
                      label="Prefix"
                      value={barcodeSettings.prefix}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, prefix: text.toUpperCase() })}
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Barcode prefix (e.g., OPT)</Text>
                    <TextInput
                      label="Start Number"
                      value={barcodeSettings.startNumber}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, startNumber: text })}
                      keyboardType="numeric"
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Starting barcode number</Text>
                    <TextInput
                      label="Count"
                      value={barcodeSettings.count}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, count: text })}
                      keyboardType="numeric"
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Number of barcodes</Text>
                    <TextInput
                      label="Digit Count"
                      value={barcodeSettings.digitCount}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, digitCount: text })}
                      keyboardType="numeric"
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Number of digits for barcode number (e.g., 7 for OPT0000001)</Text>
                    <TextInput
                      label="Company Name"
                      value={barcodeSettings.companyName}
                      onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, companyName: text.toUpperCase() })}
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Company name above barcode</Text>
                    <TextInput
                      label="Points per Scan"
                      value={pointsPerScan}
                      onChangeText={setPointsPerScan}
                      keyboardType="numeric"
                      style={styles.input}
                      theme={{ colors: { text: colors.text, primary: colors.primary } }}
                      mode="outlined"
                    />
                    <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666' }]}>Points awarded per barcode scan</Text>
                  </>
                )}
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.hintText, { color: isDarkMode ? '#AAA' : '#666', marginBottom: 4 }]}>PDF Mode</Text>
                  <Picker
                    selectedValue={barcodeSettings.mode}
                    onValueChange={(value) => setBarcodeSettings({ ...barcodeSettings, mode: value })}
                    style={{ color: isDarkMode ? '#FFF' : '#000' }}
                    dropdownIconColor={colors.primary}
                    mode="dropdown"
                  >
                    <Picker.Item label="With Outline" value="with-outline" />
                    <Picker.Item label="Without Outline" value="without-outline" />
                    <Picker.Item label="Only Outline" value="only-outline" />
                  </Picker>
                </View>
                <Button
                  mode="contained"
                  onPress={generateBarcodePDF}
                  style={styles.button}
                  buttonColor={colors.primary}
                  textColor="#FFF"
                  labelStyle={styles.buttonLabel}
                  disabled={useAdminRanges && (!selectedRangeId || !selectedAdminForUser)}
                  loading={pdfLoading}
                >
                  {pdfLoading ? 'Generating PDF...' : 'Generate PDF'}
                </Button>
              </Card.Content>
            </Card>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#212121' : colors.background }]}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
      <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'home' && styles.activeTab]} onPress={() => setCurrentTab('home')}>
          <MaterialIcons name="home" size={24} color={currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'admins' && styles.activeTab]} onPress={() => setCurrentTab('admins')}>
          <MaterialIcons name="supervisor-account" size={24} color={currentTab === 'admins' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'admins' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Admins</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'users' && styles.activeTab]} onPress={() => setCurrentTab('users')}>
          <MaterialIcons name="people" size={24} color={currentTab === 'users' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'users' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'barcode' && styles.activeTab]} onPress={() => setCurrentTab('barcode')}>
          <MaterialIcons name="qr-code" size={24} color={currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Barcode</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subtitle: { fontSize: 24, fontWeight: 'bold' },
  toggle: { marginLeft: 10 },
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cardText: { fontSize: 16, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  searchBar: {
    marginBottom: 16,
    borderRadius: 25,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  searchInput: {
    height: 40,
    fontSize: 16,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  pickerContainer: {
    width: '100%',
    borderRadius: 12,
    elevation: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    height: 48,
    width: '100%',
  },
  button: {
    marginVertical: 8,
    borderRadius: 8,
    paddingVertical: 4,
  },
  actionButton: {
    marginHorizontal: 4,
    marginVertical: 4,
    borderRadius: 8,
    minWidth: 80,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
  emptyText: { fontSize: 16, textAlign: 'center', marginVertical: 20 },
  barcodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#FFD700' },
  tabText: { fontSize: 12, marginTop: 4 },
  input: {
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  hintText: {
    fontSize: 12,
    marginBottom: 12,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
});