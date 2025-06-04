import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Text, ScrollView, ActivityIndicator, Dimensions, Alert, Platform, TouchableOpacity, Switch } from 'react-native';
import { Button, Card, TextInput, useTheme } from 'react-native-paper';
import { SearchBar } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import debounce from 'lodash.debounce';

// const BASE_URL = 'http://localhost:5000';
const BASE_URL = 'http://3.82.246.165:5000';


const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Reusable ButtonText component for consistent button text rendering
const ButtonText = ({ children, style }) => (
  <Text
    adjustsFontSizeToFit
    numberOfLines={2}
    minimumFontScale={0.7}
    style={[
      {
        textAlign: 'center',
        paddingHorizontal: 2,
        fontSize: 14,
        lineHeight: 16,
        flexWrap: 'wrap',
        flexShrink: 1,
        width: '100%',
        overflow: 'hidden',
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export default function AdminDashboard({ navigation }) {
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);
  const [users, setUsers] = useState([]);
  const [barcodes, setBarcodes] = useState([]);
  const [barcodeRanges, setBarcodeRanges] = useState([]);
  const [searchUser, setSearchUser] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [searchUniqueCode, setSearchUniqueCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userBarcodes, setUserBarcodes] = useState([]);
  const [selectedBarcodeUser, setSelectedBarcodeUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('home');
  const [adminUser, setAdminUser] = useState(null);
  const [searchUniqueCodeResult, setSearchUniqueCodeResult] = useState(null);
  const [searchUniqueCodeLoading, setSearchUniqueCodeLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(null);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [barcodeSettings, setBarcodeSettings] = useState({
    startBarcode: '',
    endBarcode: '',
    pointsPerScan: '10',
  });
  const [editRange, setEditRange] = useState(null);
  const [generateRandomSuffix, setGenerateRandomSuffix] = useState(false);

  const showConfirmDialog = useCallback((title, message, onConfirm, onCancel) => {
    if (isWeb) {
      if (window.confirm(`${title}\n${message}`)) onConfirm();
      else onCancel?.();
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
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
      const [usersRes, barcodesRes, rangesRes] = await Promise.all([
        axios.get(`${BASE_URL}/users`, { headers: { Authorization: token } }),
        axios.get(`${BASE_URL}/barcodes`, { headers: { Authorization: token } }),
        axios.get(`${BASE_URL}/barcode-ranges`, { headers: { Authorization: token } }),
      ]);
      const validUsers = usersRes.data.filter(user => user.name && user.mobile && user.role === 'user');
      const sortedUsers = validUsers.sort((a, b) => {
        if (a.status === 'approved' && b.status === 'approved') return b.points - a.points;
        if (a.status === 'approved') return -1;
        if (b.status === 'approved') return 1;
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return 0;
      });
      setUsers(sortedUsers);
      setBarcodes(barcodesRes.data);
      setBarcodeRanges(rangesRes.data);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Fetch Failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

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
    const fetchAdminUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) setAdminUser(JSON.parse(storedUser));
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Admin Data Fetch Failed' });
      }
    };
    fetchAdminUser();
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigation.navigate('AdminDashboard');
        return true;
      };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [navigation])
  );

  const searchByUniqueCode = useCallback(async () => {
    if (!searchUniqueCode) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter a unique code' });
      return;
    }
    setSearchUniqueCodeLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token found');
      const response = await axios.get(`${BASE_URL}/users/search?uniqueCode=${searchUniqueCode}`, { headers: { Authorization: token } });
      setSearchUniqueCodeResult(response.data);
      Toast.show({ type: 'success', text1: 'Success', text2: 'User found' });
    } catch (error) {
      setSearchUniqueCodeResult(null);
      Toast.show({ type: 'error', text1: 'Error', text2: error.response?.data?.message || 'User not found' });
    } finally {
      setSearchUniqueCodeLoading(false);
    }
  }, [searchUniqueCode]);

  const handleStatusUpdate = useCallback(async (userId, status) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/users/${userId}/status`,
        { status },
        { headers: { Authorization: token } }
      );
      Toast.show({ type: 'success', text1: 'Status Updated' });
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Update Failed' });
    } finally {
      setLoading(false);
    }
  }, [fetchData, handleUnauthorized]);

  const handleDeleteUser = useCallback((userId) => {
    showConfirmDialog('Confirm Delete', 'Are you sure you want to delete this user?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/users/${userId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'User Deleted' });
        await fetchData();
        if (selectedUserId === userId) setSelectedUserId(null);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, selectedUserId, showConfirmDialog]);

  const handleEditUser = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/users/${editUser._id}`,
        { ...editUser },
        { headers: { Authorization: token } }
      );
      Toast.show({ type: 'success', text1: 'Profile Updated' });
      setEditUser(null);
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Update Failed' });
    } finally {
      setLoading(false);
    }
  }, [editUser, fetchData, handleUnauthorized]);

  const handleResetPoints = useCallback((userId) => {
    showConfirmDialog('Confirm Reset', 'Are you sure you want to reset this user’s points?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.put(`${BASE_URL}/users/${userId}/reset-points`, {}, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Points Reset' });
        await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Reset Failed' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, showConfirmDialog]);

  const fetchUserBarcodes = useCallback(async (userId) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${BASE_URL}/barcodes/user/${userId}`, { headers: { Authorization: token } });
      setUserBarcodes(response.data.barcodes || response.data);
      setSelectedUserId(userId);
      if (!response.data.barcodes?.length && !response.data.length) Toast.show({ type: 'info', text1: 'No Barcodes' });
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Fetch Failed' });
      setUserBarcodes([]);
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  const handleDeleteBarcode = useCallback((barcodeId) => {
    showConfirmDialog('Confirm Delete', 'Are you sure you want to delete this barcode?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/barcodes/${barcodeId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Barcode Deleted' });
        if (selectedUserId) await fetchUserBarcodes(selectedUserId);
        else await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, fetchUserBarcodes, handleUnauthorized, selectedUserId, showConfirmDialog]);

  const handleDeleteAllBarcodes = useCallback(() => {
    showConfirmDialog('Confirm Delete', 'Are you sure you want to delete all barcodes?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/barcodes`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Barcodes Deleted' });
        await fetchData();
        setUserBarcodes([]);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Failed' });
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, showConfirmDialog]);

  const handleDeleteUserBarcodes = useCallback((userId) => {
    showConfirmDialog('Confirm Delete', 'Are you sure you want to delete all barcodes for this user?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await axios.delete(`${BASE_URL}/barcodes/user/${userId}`, { headers: { Authorization: token } });
        Toast.show({ type: 'success', text1: 'Barcodes Deleted', text2: response.data.message });
        await fetchData();
        if (selectedUserId === userId) setUserBarcodes([]);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        if (error.response?.status === 404) {
          Toast.show({ type: 'info', text1: 'No Barcodes' });
        } else {
          Toast.show({ type: 'error', text1: 'Delete Failed' });
        }
      } finally {
        setLoading(false);
      }
    });
  }, [fetchData, handleUnauthorized, selectedUserId, showConfirmDialog]);

  const handleCreateBarcodeRange = useCallback(async () => {
    const { startBarcode, endBarcode, pointsPerScan } = barcodeSettings;
    if (!startBarcode || !endBarcode || !pointsPerScan) {
      Toast.show({ type: 'error', text1: 'All fields are required' });
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(startBarcode) || !/^[A-Za-z0-9]+$/.test(endBarcode)) {
      Toast.show({ type: 'error', text1: 'Barcodes must be alphanumeric' });
      return;
    }
    if (isNaN(pointsPerScan) || parseInt(pointsPerScan) <= 0) {
      Toast.show({ type: 'error', text1: 'Points must be a positive number' });
      return;
    }
    if (startBarcode > endBarcode) {
      Toast.show({ type: 'error', text1: 'End barcode must be greater than or equal to start barcode' });
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const prefixMatch = startBarcode.match(/^[A-Za-z0-9]+/);
      const prefix = prefixMatch ? prefixMatch[0].slice(0, 4) : 'OPT';
      await axios.post(
        `${BASE_URL}/barcode-ranges`,
        { start: startBarcode.toUpperCase(), end: endBarcode.toUpperCase(), points: parseInt(pointsPerScan), prefix, generateRandomSuffix },
        { headers: { Authorization: token } }
      );
      Toast.show({ type: 'success', text1: 'Barcode Range Created' });
      setBarcodeSettings({ startBarcode: '', endBarcode: '', pointsPerScan: '10' });
      setGenerateRandomSuffix(false);
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Create Failed', text2: error.response?.data?.message });
    } finally {
      setLoading(false);
    }
  }, [barcodeSettings, generateRandomSuffix, fetchData, handleUnauthorized]);

  const handleEditRange = useCallback(async (rangeId) => {
    if (!editRange || parseInt(editRange.points) < 0) {
      Toast.show({ type: 'error', text1: 'Invalid Range or Points', text2: 'Ensure all fields are valid and points are non-negative.' });
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/barcode-ranges/${rangeId}`,
        {
          start: editRange.start,
          end: editRange.end,
          points: parseInt(editRange.points),
        },
        { headers: { Authorization: token } }
      );
      setBarcodeRanges(barcodeRanges.map((range) => (range._id === rangeId ? { ...range, start: editRange.start, end: editRange.end, points: parseInt(editRange.points) } : range)));
      setEditRange(null);
      Toast.show({ type: 'success', text1: 'Range Updated' });
      await fetchData();
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Update Range Failed', text2: error.response?.data?.message });
    } finally {
      setLoading(false);
    }
  }, [barcodeRanges, editRange, handleUnauthorized, fetchData]);

  const handleDeleteRange = useCallback((rangeId) => {
    showConfirmDialog('Delete Range', 'Are you sure you want to delete this range?', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        await axios.delete(`${BASE_URL}/barcode-ranges/${rangeId}`, { headers: { Authorization: token } });
        setBarcodeRanges(barcodeRanges.filter((range) => range._id !== rangeId));
        Toast.show({ type: 'success', text1: 'Range Deleted' });
        await fetchData();
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Delete Range Failed', text2: error.response?.data?.message });
      } finally {
        setLoading(false);
      }
    });
  }, [barcodeRanges, handleUnauthorized, showConfirmDialog, fetchData]);

  const handleViewPassword = useCallback((userId) => {
    showConfirmDialog('View Password', 'Are you sure you want to view this user\'s password? This is a sensitive operation.', async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await axios.get(`${BASE_URL}/users/${userId}/password`, { headers: { Authorization: token } });
        setShowPassword(response.data.password);
        setPasswordUserId(userId);
        Toast.show({ type: 'success', text1: 'Password Retrieved' });
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({ type: 'error', text1: 'Fetch Password Failed', text2: error.response?.data?.message });
      } finally {
        setLoading(false);
      }
    });
  }, [handleUnauthorized, showConfirmDialog]);

  const handleExportBarcodes = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${BASE_URL}/export-barcodes`, { headers: { Authorization: token }, responseType: isWeb ? 'blob' : 'blob' });
      if (isWeb) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'barcodes_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.documentDirectory}barcodes_export.csv`;
        await FileSystem.writeAsStringAsync(fileUri, await response.data.text(), { encoding: FileSystem.EncodingType.UTF8 });
        Toast.show({ type: 'success', text1: 'Export Successful', text2: `Saved to ${fileUri}` });
      }
      Toast.show({ type: 'success', text1: 'Export Successful' });
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      Toast.show({ type: 'error', text1: 'Export Failed' });
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized, isWeb]);

  const handleLogout = useCallback(async () => {
    try {
      await AsyncStorage.clear();
      navigation.replace('Home');
      Toast.show({ type: 'success', text1: 'Logged Out' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Logout Failed' });
    }
  }, [navigation]);

  const debouncedSetSearchUser = useCallback(debounce((value) => setSearchUser(value), 300), []);
  const debouncedSetSearchBarcode = useCallback(debounce((value) => setSearchBarcode(value), 300), []);

  const filteredUsers = useMemo(() => {
    return users.filter(
      (user) => (user.name || '').toLowerCase().includes(searchUser.toLowerCase()) || 
               (user.mobile || '').toLowerCase().includes(searchUser.toLowerCase())
    );
  }, [users, searchUser]);

  const filteredBarcodes = useMemo(() => {
    return barcodes.filter((barcode) => (barcode.value || '').toLowerCase().includes(searchBarcode.toLowerCase()));
  }, [barcodes, searchBarcode]);

  const getItemLayout = useCallback((data, index) => ({ length: 200, offset: 200 * index, index }), []);

  const renderUserItem = useCallback(({ item }) => (
    <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
      <Card.Content>
        {selectedUserId !== item._id ? (
          editUser && editUser._id === item._id ? (
            <View style={styles.editContainer}>
              <TextInput
                label="Name"
                value={editUser.name}
                onChangeText={(text) => setEditUser({ ...editUser, name: text })}
                style={styles.input}
                theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                mode="outlined"
              />
              <TextInput
                label="Mobile Number"
                value={editUser.mobile}
                onChangeText={(text) => setEditUser({ ...editUser, mobile: text })}
                style={styles.input}
                theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                mode="outlined"
                keyboardType="phone-pad"
              />
              <TextInput
                label="Location"
                value={editUser.location}
                onChangeText={(text) => setEditUser({ ...editUser, location: text })}
                style={styles.input}
                theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                mode="outlined"
              />
              <TextInput
                label="Points"
                value={editUser.points.toString()}
                onChangeText={(text) => setEditUser({ ...editUser, points: parseInt(text) || 0 })}
                keyboardType="numeric"
                style={styles.input}
                theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                mode="outlined"
              />
              <View style={styles.buttonRow}>
                <Button
                  mode="contained"
                  onPress={handleEditUser}
                  style={styles.actionButton}
                  buttonColor={colors.primary}
                  textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                >
                  <ButtonText>Save</ButtonText>
                </Button>
                <Button
                  mode="contained"
                  onPress={() => setEditUser(null)}
                  style={styles.actionButton}
                  buttonColor={colors.secondary}
                  textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Name: {item.name}</Text>
              <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Mobile: {item.mobile}</Text>
              <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Status: {item.status === 'approved' ? 'Active' : item.status}</Text>
              <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {item.points}</Text>
              <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'N/A'}</Text>
              {passwordUserId === item._id && showPassword && (
                <View style={styles.passwordContainer}>
                  <Text style={[styles.cardText, { color: colors.error, fontWeight: 'bold' }]}>
                    Warning: Passwords are sensitive!
                  </Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>
                    Password: {showPassword}
                  </Text>
                  <Button
                    mode="text"
                    onPress={() => {
                      setShowPassword(null);
                      setPasswordUserId(null);
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
                      onPress={() => handleStatusUpdate(item._id, 'approved')}
                      style={styles.actionButton}
                      buttonColor={colors.primary}
                      textColor={isDarkMode ? '#FFF' : '#212121'}
                      labelStyle={styles.buttonLabel}
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
                      onPress={() => setEditUser(item)}
                      style={styles.actionButton}
                      textColor={isDarkMode ? '#FFD700' : colors.accent}
                      labelStyle={styles.buttonLabel}
                    >
                      Edit
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
                    <Button
                      mode="outlined"
                      onPress={() => handleDeleteUserBarcodes(item._id)}
                      style={styles.actionButton}
                      textColor={isDarkMode ? '#FF5555' : colors.error}
                      labelStyle={styles.buttonLabel}
                    >
                      Delete Barcodes
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => fetchUserBarcodes(item._id)}
                      style={styles.actionButton}
                      textColor={isDarkMode ? '#00FF00' : colors.accent}
                      labelStyle={styles.buttonLabel}
                    >
                      View Scanned Barcodes
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => {
                        setPasswordUserId(item._id);
                        handleViewPassword(item._id);
                      }}
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
          )
        ) : (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Scanned Barcodes of {item.name}</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Total Barcodes Scanned: {userBarcodes.length}</Text>
            <FlatList
              data={userBarcodes}
              keyExtractor={(barcode) => barcode._id}
              renderItem={({ item: barcode }) => (
                <View style={styles.barcodeItem}>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text, flex: 1 }]}>
                    {barcode.value} - {new Date(barcode.createdAt).toLocaleString()} - Points: {barcode.pointsAwarded} - Location: {barcode.location || 'N/A'}
                  </Text>
                  <Button
                    mode="contained"
                    onPress={() => handleDeleteBarcode(barcode._id)}
                    style={[styles.actionButton, { minWidth: 80 }]}
                    buttonColor={colors.error}
                    textColor="#FFFFFF"
                  >
                    <ButtonText>Delete</ButtonText>
                  </Button>
                </View>
              )}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No barcodes scanned.</Text>}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={getItemLayout}
              removeClippedSubviews={true}
            />
            <Button
              mode="contained"
              onPress={() => setSelectedUserId(null)}
              style={styles.button}
              buttonColor={colors.primary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            >
              <ButtonText>Back</ButtonText>
            </Button>
          </>
        )}
      </Card.Content>
    </Card>
  ), [isDarkMode, colors, editUser, selectedUserId, userBarcodes, handleEditUser, handleStatusUpdate, handleDeleteUser, handleResetPoints, handleDeleteUserBarcodes, fetchUserBarcodes, handleDeleteBarcode, handleViewPassword, showPassword, passwordUserId, setPasswordUserId]);

  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return (
          <>
            <View style={styles.header}>
              <Text style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Admin Home</Text>
              <ThemeToggle style={styles.toggle} />
            </View>
            <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
              <Card.Title title="Admin Details" titleStyle={[styles.cardTitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]} />
              <Card.Content>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Admin Name: {adminUser?.name || 'Unknown'}</Text>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Total Users: {users.length}</Text>
                <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Total Ranges Set: {barcodeRanges.length}</Text>
              </Card.Content>
            </Card>
            <Button
              mode="contained"
              onPress={handleLogout}
              style={styles.button}
              buttonColor={colors.error}
              textColor="#FFFFFF"
            >
              <ButtonText>Logout</ButtonText>
            </Button>
            <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
              <Card.Title title="Set Barcode Range" titleStyle={[styles.cardTitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]} />
              <Card.Content>
                <TextInput
                  label="Start Barcode"
                  value={barcodeSettings.startBarcode}
                  onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, startBarcode: text.toUpperCase() })}
                  style={styles.input}
                  theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                  mode="outlined"
                />
                <Text style={[styles.hintText, { color: isDarkMode ? '#AAAAAA' : '#666666' }]}>Alphanumeric start barcode (e.g., B2MA000001)</Text>
                <TextInput
                  label="End Barcode"
                  value={barcodeSettings.endBarcode}
                  onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, endBarcode: text.toUpperCase() })}
                  style={styles.input}
                  theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                  mode="outlined"
                />
                <Text style={[styles.hintText, { color: isDarkMode ? '#AAAAAA' : '#666666' }]}>Alphanumeric end barcode (e.g., B2MA999999)</Text>
                <TextInput
                  label="Points Per Scan"
                  value={barcodeSettings.pointsPerScan}
                  onChangeText={(text) => setBarcodeSettings({ ...barcodeSettings, pointsPerScan: text })}
                  keyboardType="numeric"
                  style={styles.input}
                  theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                  mode="outlined"
                />
                <Text style={[styles.hintText, { color: isDarkMode ? '#AAAAAA' : '#666666' }]}>Points awarded per barcode scan</Text>
                <View style={styles.switchContainer}>
                  <Text style={[styles.hintText, { color: isDarkMode ? '#AAAAAA' : '#666666' }]}>Generate Random Suffix</Text>
                  <Switch
                    value={generateRandomSuffix}
                    onValueChange={setGenerateRandomSuffix}
                    trackColor={{ false: '#767577', true: colors.primary }}
                    thumbColor={generateRandomSuffix ? '#f4f3f4' : '#f4f3f4'}
                  />
                </View>
                <Text style={[styles.hintText, { color: isDarkMode ? '#AAAAAA' : '#666666' }]}>Add random 5-character suffix to barcodes (e.g., B2MA000001-XYZ12)</Text>
                <Button
                  mode="contained"
                  onPress={handleCreateBarcodeRange}
                  style={styles.button}
                  buttonColor={colors.primary}
                  textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                >
                  <ButtonText>Create Range</ButtonText>
                </Button>
              </Card.Content>
            </Card>
            <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
              <Card.Title title="Current Ranges" titleStyle={[styles.cardTitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]} />
              <Card.Content>
                <FlatList
                  data={barcodeRanges}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item, index }) => (
                    <Card style={[styles.rangeCard, { backgroundColor: isDarkMode ? '#444' : '#f5f5f5' }]}>
                      <Card.Content>
                        <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Range {index + 1}</Text>
                        {editRange && editRange._id === item._id ? (
                          <>
                            <TextInput
                              label="Barcode Start"
                              value={editRange.start}
                              onChangeText={(text) => setEditRange({ ...editRange, start: text })}
                              style={styles.input}
                              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                              mode="outlined"
                            />
                            <TextInput
                              label="Barcode End"
                              value={editRange.end}
                              onChangeText={(text) => setEditRange({ ...editRange, end: text })}
                              style={styles.input}
                              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                              mode="outlined"
                            />
                            <TextInput
                              label="Points per Scan"
                              value={editRange.points}
                              onChangeText={(text) => setEditRange({ ...editRange, points: text })}
                              keyboardType="numeric"
                              style={styles.input}
                              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
                              mode="outlined"
                            />
                            <View style={styles.buttonRow}>
                              <Button
                                mode="contained"
                                onPress={() => handleEditRange(item._id)}
                                style={styles.actionButton}
                                buttonColor={colors.primary}
                                textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                              >
                                <ButtonText>Save</ButtonText>
                              </Button>
                              <Button
                                mode="contained"
                                onPress={() => setEditRange(null)}
                                style={styles.actionButton}
                                buttonColor={colors.secondary}
                                textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                              >
                                <ButtonText>Cancel</ButtonText>
                              </Button>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Barcode Start: {item.start}</Text>
                            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Barcode End: {item.end}</Text>
                            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {item.points}</Text>
                            <View style={styles.buttonRow}>
                              <Button
                                mode="contained"
                                onPress={() => setEditRange({ _id: item._id, start: item.start.toString(), end: item.end.toString(), points: item.points.toString() })}
                                style={styles.actionButton}
                                buttonColor={colors.accent}
                                textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                              >
                                <ButtonText>Edit</ButtonText>
                              </Button>
                              <Button
                                mode="contained"
                                onPress={() => handleDeleteRange(item._id)}
                                style={styles.actionButton}
                                buttonColor={colors.error}
                                textColor="#FFFFFF"
                              >
                                <ButtonText>Delete</ButtonText>
                              </Button>
                            </View>
                          </>
                        )}
                      </Card.Content>
                    </Card>
                  )}
                  ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No ranges set.</Text>}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  getItemLayout={getItemLayout}
                  removeClippedSubviews={true}
                />
              </Card.Content>
            </Card>
          </>
        );
      case 'users':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Users</Text>
            <SearchBar
              placeholder="Search Users by Name or Mobile"
              value={searchUser}
              onChangeText={debouncedSetSearchUser}
              inputStyle={{ color: isDarkMode ? '#FFFFFF' : colors.text }}
              containerStyle={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}
              round
            />
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item._id}
              renderItem={renderUserItem}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No users found.</Text>}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={getItemLayout}
              removeClippedSubviews={true}
            />
          </>
        );
      case 'search':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Search</Text>
            <SearchBar
              placeholder="Search Users by Name or Mobile"
              value={searchUser}
              onChangeText={debouncedSetSearchUser}
              inputStyle={{ color: isDarkMode ? '#FFFFFF' : colors.text }}
              containerStyle={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}
              round
            />
            {searchUser && (
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                    <Card.Content>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Name: {item.name}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Mobile: {item.mobile}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Status: {item.status === 'approved' ? 'Active' : item.status}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {item.points}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'N/A'}</Text>
                      <Button
                        mode="contained"
                        onPress={() => fetchUserBarcodes(item._id)}
                        style={styles.actionButton}
                        buttonColor={colors.accent}
                        textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                      >
                        <ButtonText>View Scanned Barcodes</ButtonText>
                      </Button>
                    </Card.Content>
                  </Card>
                )}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No users found.</Text>}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                getItemLayout={getItemLayout}
                removeClippedSubviews={true}
              />
            )}
            <TextInput
              placeholder="Search by Unique Code"
              value={searchUniqueCode}
              onChangeText={setSearchUniqueCode}
              style={[styles.input, { backgroundColor: isDarkMode ? '#444' : '#FFFFFF' }]}
              placeholderTextColor={isDarkMode ? '#AAAAAA' : '#666666'}
              mode="outlined"
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
            />
            <Button
              mode="contained"
              onPress={searchByUniqueCode}
              loading={searchUniqueCodeLoading}
              disabled={searchUniqueCodeLoading}
              buttonColor={colors.primary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
              style={styles.button}
            >
              <ButtonText>Search Unique Code</ButtonText>
            </Button>
            {searchUniqueCodeResult && (
              <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                <Card.Content>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Name: {searchUniqueCodeResult.name}</Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Mobile: {searchUniqueCodeResult.mobile}</Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Unique Code: {searchUniqueCodeResult.uniqueCode}</Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Status: {searchUniqueCodeResult.status === 'approved' ? 'Active' : searchUniqueCodeResult.status}</Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {searchUniqueCodeResult.points}</Text>
                  <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {searchUniqueCodeResult.location || 'N/A'}</Text>
                  <Button
                    mode="contained"
                    onPress={() => fetchUserBarcodes(searchUniqueCodeResult._id)}
                    style={styles.actionButton}
                    buttonColor={colors.accent}
                    textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                  >
                    <ButtonText>View Scanned Barcodes</ButtonText>
                  </Button>
                </Card.Content>
              </Card>
            )}
            <SearchBar
              placeholder="Search Barcodes by Value"
              value={searchBarcode}
              onChangeText={debouncedSetSearchBarcode}
              inputStyle={{ color: isDarkMode ? '#FFFFFF' : colors.text }}
              containerStyle={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}
              round
            />
            {searchBarcode && (
              <FlatList
                data={filteredBarcodes}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                    <Card.Content>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Value: {item.value}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>User: {item.userId?.name || 'Unknown'} ({item.userId?.mobile || 'N/A'})</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points Awarded: {item.pointsAwarded}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Timestamp: {new Date(item.createdAt).toLocaleString()}</Text>
                      <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'N/A'}</Text>
                      <View style={styles.buttonRow}>
                        <Button
                          mode="contained"
                          onPress={() => setSelectedBarcodeUser(users.find((u) => u._id === item.userId?._id))}
                          style={styles.actionButton}
                          buttonColor={colors.primary}
                          textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                        >
                          <ButtonText>View User</ButtonText>
                        </Button>
                        <Button
                          mode="contained"
                          onPress={() => handleDeleteBarcode(item._id)}
                          style={styles.actionButton}
                          buttonColor={colors.error}
                          textColor="#FFFFFF"
                        >
                          <ButtonText>Delete</ButtonText>
                        </Button>
                      </View>
                    </Card.Content>
                  </Card>
                )}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No barcodes scanned.</Text>}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                getItemLayout={getItemLayout}
                removeClippedSubviews={true}
              />
            )}
          </>
        );
      case 'barcode':
        return (
          <>
            <Text style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Barcode Management</Text>
            <SearchBar
              placeholder="Search Barcodes by Value"
              value={searchBarcode}
              onChangeText={debouncedSetSearchBarcode}
              inputStyle={{ color: isDarkMode ? '#FFFFFF' : colors.text }}
              containerStyle={[styles.searchBar, { backgroundColor: isDarkMode ? '#555' : colors.surface }]}
              round
            />
            <FlatList
              data={filteredBarcodes}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Value: {item.value}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>User: {item.userId?.name || 'Unknown'} ({item.userId?.mobile || 'N/A'})</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points Awarded: {item.pointsAwarded}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Timestamp: {new Date(item.createdAt).toLocaleString()}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'N/A'}</Text>
                    <View style={styles.buttonRow}>
                      <Button
                        mode="contained"
                        onPress={() => setSelectedBarcodeUser(users.find((u) => u._id === item.userId?._id))}
                        style={styles.actionButton}
                        buttonColor={colors.primary}
                        textColor={isDarkMode ? '#FFFFFF' : '#212121'}
                      >
                        <ButtonText>View User</ButtonText>
                      </Button>
                      <Button
                        mode="contained"
                        onPress={() => handleDeleteBarcode(item._id)}
                        style={styles.actionButton}
                        buttonColor={colors.error}
                        textColor="#FFFFFF"
                      >
                        <ButtonText>Delete</ButtonText>
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No barcodes scanned.</Text>}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={getItemLayout}
              removeClippedSubviews={true}
            />
            <Button
              mode="contained"
              onPress={handleExportBarcodes}
              style={styles.button}
              buttonColor={colors.accent}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            >
              <ButtonText>Export Barcodes (CSV)</ButtonText>
            </Button>
            <Button
              mode="contained"
              onPress={handleDeleteAllBarcodes}
              style={styles.button}
              buttonColor={colors.error}
              textColor="#FFFFFF"
            >
              <ButtonText>Delete All Barcodes</ButtonText>
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} removeClippedSubviews={true}>
        {renderContent()}
        {editUser && (
          <View style={[styles.modal, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Edit User</Text>
            <TextInput
              label="Name"
              value={editUser.name}
              onChangeText={(text) => setEditUser({ ...editUser, name: text })}
              style={styles.input}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
            />
            <TextInput
              label="Mobile Number"
              value={editUser.mobile}
              onChangeText={(text) => setEditUser({ ...editUser, mobile: text })}
              style={styles.input}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
              keyboardType="phone-pad"
            />
            <TextInput
              label="Location"
              value={editUser.location}
              onChangeText={(text) => setEditUser({ ...editUser, location: text })}
              style={styles.input}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
            />
            <TextInput
              label="Points"
              value={editUser.points.toString()}
              onChangeText={(text) => setEditUser({ ...editUser, points: parseInt(text) || 0 })}
              keyboardType="numeric"
              style={styles.input}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
            />
            <Button
              mode="contained"
              onPress={handleEditUser}
              style={styles.button}
              buttonColor={colors.primary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            >
              <ButtonText>Save</ButtonText>
            </Button>
            <Button
              mode="contained"
              onPress={() => setEditUser(null)}
              style={styles.button}
              buttonColor={colors.secondary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
          </View>
        )}
        {selectedBarcodeUser && (
          <View style={[styles.modal, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>User Details</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}>Name: {selectedBarcodeUser.name}</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Mobile: {selectedBarcodeUser.mobile}</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Status: {selectedBarcodeUser.status === 'approved' ? 'Active' : selectedBarcodeUser.status}</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {selectedBarcodeUser.points}</Text>
            <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {selectedBarcodeUser.location || 'N/A'}</Text>
            <Button
              mode="contained"
              onPress={() => setSelectedBarcodeUser(null)}
              style={styles.button}
              buttonColor={colors.secondary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
          </View>
        )}
      </ScrollView>
      <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#222' : colors.surface }]}>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'home' && styles.activeTab]} onPress={() => setCurrentTab('home')}>
          <MaterialIcons name="home" size={24} color={currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text) }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'users' && styles.activeTab]} onPress={() => setCurrentTab('users')}>
          <MaterialIcons name="people" size={24} color={currentTab === 'users' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'users' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text) }]}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'search' && styles.activeTab]} onPress={() => setCurrentTab('search')}>
          <MaterialIcons name="search" size={24} color={currentTab === 'search' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'search' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text) }]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'barcode' && styles.activeTab]} onPress={() => setCurrentTab('barcode')}>
          <MaterialIcons name="qr-code" size={24} color={currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFFFFF' : colors.text) }]}>Barcode</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Layout Containers
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modal: {
    padding: 20,
    margin: 20,
    borderRadius: 12,
    elevation: 4,
  },

  // Navigation
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopWidth: 1,
    borderTopColor: '#CCCCCC',
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },

  // Cards
  card: {
    marginVertical: 10,
    borderRadius: 12,
    elevation: 4,
  },
  rangeCard: {
    marginVertical: 5,
    borderRadius: 8,
    elevation: 2,
  },
  editContainer: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },

  // Inputs and Search
  searchBar: {
    marginBottom: 16,
    borderRadius: 25,
    paddingHorizontal: 10,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    marginVertical: 10,
  },

  // Buttons
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

  // Text
  subtitle: {
    fontSize: 22,
    fontWeight: '600',
    marginVertical: 20,
    textAlign: 'center',
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    fontSize: 16,
    marginVertical: 4,
    fontWeight: '500',
  },
  tabText: {
    fontSize: 12,
    marginTop: 5,
  },
  hintText: {
    fontSize: 12,
    marginBottom: 10,
    color: '#666666',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginVertical: 10,
  },

  // Miscellaneous
  barcodeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingRight: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  passwordContainer: {
    marginTop: 10,
  },
  toggle: {
    marginRight: 10,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
});