import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, StyleSheet, Platform, FlatList, ActivityIndicator, Animated, BackHandler, TouchableOpacity, ScrollView } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { BarCodeScanner } from 'expo-barcode-scanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

// const BASE_URL = 'http://localhost:5002';
// const BASE_URL = 'https://barcodescane-backend.onrender.com';
const BASE_URL = 'http://52.72.238.42:5002';


export default function UserDashboard({ navigation }) {
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);

  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [barcodeData, setBarcodeData] = useState(null);
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [barcodes, setBarcodes] = useState([]);
  const [searchBarcode, setSearchBarcode] = useState('');
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [currentTab, setCurrentTab] = useState('home');
  const [scanRegion, setScanRegion] = useState(null);
  const scanLineAnim = React.useRef(new Animated.Value(0)).current;

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
        const updatedUser = {
          id: response.data.user.id,
          name: response.data.user.name,
          mobile: response.data.user.mobile,
          points: response.data.user.points || 0,
          location: response.data.user.location || 'Unknown',
          adminId: response.data.user.adminId,
          status: response.data.user.status,
        };
        setUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        Toast.show({ type: 'success', text1: 'Session Refreshed' });
      } catch (error) {
        await AsyncStorage.clear();
        navigation.replace('Home');
        Toast.show({
          type: 'error',
          text1: 'Session Refresh Failed',
          text2: error.response?.data?.message || 'Please log in again.',
        });
      }
    };
    const interval = setInterval(refreshToken, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [navigation]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (!parsedUser.id) throw new Error('Invalid user ID');
          setUser(parsedUser);
          await fetchUserProfile(parsedUser.id);
          await fetchUserBarcodes(parsedUser.id);
        } else {
          throw new Error('No user data found');
        }
      } catch (err) {
        await AsyncStorage.clear();
        navigation.replace('Home');
        Toast.show({
          type: 'error',
          text1: 'Initialization Failed',
          text2: err.message || 'Could not load user data.',
        });
      }
    };
    initialize();
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') {
        const onBackPress = () => {
          navigation.navigate('UserDashboard');
          return true;
        };
        BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      }
    }, [navigation])
  );

  useEffect(() => {
    if (showScanner) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [showScanner]);

  const scanLineTranslate = useMemo(
    () =>
      scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 180],
      }),
    [scanLineAnim]
  );

  const handleUnauthorized = useCallback(
    async (error) => {
      if (error.response?.status === 401 || error.response?.status === 403) {
        await AsyncStorage.clear();
        navigation.replace('Home');
        Toast.show({
          type: 'error',
          text1: error.response?.status === 403 ? 'Account Not Approved' : 'Session Expired',
          text2: error.response?.data?.message || (error.response?.status === 403 ? 'Your account is pending admin approval.' : 'Please log in again.'),
        });
        return true;
      }
      return false;
    },
    [navigation]
  );

  const fetchUserProfile = useCallback(
    async (userId) => {
      if (!userId) return;
      try {
        setLoading(true);
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('No token found');
        const response = await axios.get(`${BASE_URL}/users/${userId}`, {
          headers: { Authorization: token },
        });
        if (response.data.status !== 'approved') {
          await AsyncStorage.clear();
          navigation.replace('Home');
          Toast.show({
            type: 'error',
            text1: 'Account Not Approved',
            text2: response.data.status === 'pending' ? 'Your account is pending admin approval.' : 'Your account has been disapproved.',
          });
          return;
        }
        const updatedUser = {
          id: response.data._id,
          name: response.data.name,
          mobile: response.data.mobile,
          points: response.data.points || 0,
          location: response.data.location || 'Unknown',
          adminId: response.data.adminId,
          status: response.data.status,
        };
        setUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        if (response.data.adminId) {
          try {
            const adminResponse = await axios.get(`${BASE_URL}/users/${response.data.adminId}`, {
              headers: { Authorization: token },
            });
            setAdmin(adminResponse.data);
          } catch (adminError) {
            console.warn('Failed to fetch admin details:', adminError.message);
          }
        }
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        Toast.show({
          type: 'error',
          text1: 'Profile Fetch Failed',
          text2: error.response?.data?.message || 'Could not load profile.',
        });
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, navigation]
  );

  const fetchUserBarcodes = useCallback(
    async (userId) => {
      if (!userId) return;
      setLoading(true);
      setFetchError('');
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('No token found');
        const response = await axios.get(`${BASE_URL}/barcodes/user/${userId}`, {
          headers: { Authorization: token },
        });
        const barcodeData = Array.isArray(response.data) ? response.data : response.data.barcodes || [];
        setBarcodes(barcodeData);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        const errorMessage = error.response?.data?.message || 'Failed to fetch barcodes';
        setFetchError(errorMessage);
        setBarcodes([]);
        Toast.show({
          type: 'error',
          text1: 'Barcode Fetch Failed',
          text2: errorMessage,
        });
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized]
  );

  const memoizedBarcodes = useMemo(() => barcodes, [barcodes]);

  const filteredBarcodes = useMemo(() => {
    if (!Array.isArray(barcodes) || barcodes.length === 0) return [];
    if (!searchBarcode?.trim()) return barcodes;
    const searchLower = searchBarcode.toLowerCase().trim();
    return barcodes.filter((barcode) => barcode?.value?.toLowerCase().includes(searchLower));
  }, [barcodes, searchBarcode]);

  const handleBarCodeScanned = useCallback(
    async ({ data }) => {
      setScanned(true);
      setShowScanner(false);
      setLoading(true);
      setBarcodeData(data);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('No token found');
        const response = await axios.post(
          `${BASE_URL}/barcodes`,
          { value: data.toUpperCase(), location: user?.location || 'Unknown' },
          { headers: { Authorization: token } }
        );
        await fetchUserProfile(user?.id);
        setError('');
        Toast.show({
          type: 'success',
          text1: 'Scan Successful',
          text2: `You earned ${response.data.pointsAwarded} points!`,
        });
        await fetchUserBarcodes(user?.id);
        setTimeout(() => setScanned(false), 1000);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        const errorMessage =
          error.response?.data?.message === 'Barcode already scanned'
            ? 'Barcode already scanned'
            : error.response?.data?.message || 'Scan failed';
        setError(errorMessage);
        Toast.show({
          type: 'error',
          text1: 'Scan Failed',
          text2: errorMessage,
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchUserProfile, fetchUserBarcodes, handleUnauthorized, user]
  );

  const handleScanAction = useCallback(async () => {
    try {
      if (hasPermission === null || hasPermission === false) {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');
        if (status === 'granted') {
          await AsyncStorage.setItem('cameraPermission', 'granted');
        } else {
          Toast.show({
            type: 'error',
            text1: 'Permission Denied',
            text2: 'Camera access is required to scan barcodes.',
          });
          return;
        }
      }
      if (scanned) {
        setScanned(false);
        setBarcodeData(null);
        setError('');
      }
      setShowScanner(true);
      setScanRegion(null);
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Permission Error',
        text2: 'Could not request camera permission.',
      });
    }
  }, [hasPermission, scanned]);

  const handleScanTabPress = useCallback(async () => {
    setCurrentTab('scan');
    if (hasPermission === null) {
      try {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');
        if (status === 'granted') {
          await AsyncStorage.setItem('cameraPermission', 'granted');
        } else {
          Toast.show({
            type: 'error',
            text1: 'Permission Denied',
            text2: 'Camera access is required to scan barcodes.',
          });
        }
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: 'Permission Error',
          text2: 'Could not request camera permission.',
        });
      }
    }
  }, [hasPermission]);

  const handleCancelScan = useCallback(() => {
    setShowScanner(false);
    setScanned(false);
    setBarcodeData(null);
    setError('');
    setScanRegion(null);
  }, []);

  const handleSelectScanArea = useCallback(() => {
    setScanRegion({
      top: 100,
      left: 50,
      width: 200,
      height: 200,
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await AsyncStorage.clear();
      navigation.replace('Home');
      Toast.show({
        type: 'success',
        text1: 'Logged Out',
        text2: 'You have been logged out successfully.',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Logout Failed',
        text2: 'Could not log out.',
      });
    }
  }, [navigation]);

  const renderContent = useCallback(() => {
    switch (currentTab) {
      case 'home':
        return (
          <>
            {user && (
              <>
                <Card style={[styles.profileCard, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    <Text
                      style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Welcome, {user.name || 'Unknown'}
                    </Text>
                    <Text
                      style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Mobile: {user.mobile || 'Unknown'}
                    </Text>
                    <Text
                      style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Location: {user.location || 'Unknown'}
                    </Text>
                    <Text
                      style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text, fontSize: 20, fontWeight: 'bold' }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Points: {user.points ?? 0}
                    </Text>
                    <Text
                      style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text, fontSize: 20, fontWeight: 'bold' }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Total Scanned: {barcodes.length}
                    </Text>
                  </Card.Content>
                </Card>
                {admin && (
                  <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                    <Card.Content>
                      <Text
                        style={[styles.cardText, { color: isDarkMode ? '#FFD700' : colors.text, fontWeight: 'bold' }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        Assigned Admin: {admin.name || 'Unknown'}
                      </Text>
                      <Text
                        style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        Admin Unique Code: {admin.uniqueCode || 'N/A'}
                      </Text>
                    </Card.Content>
                  </Card>
                )}
              </>
            )}
          </>
        );
      case 'scan':
        return Platform.OS === 'web' ? (
          <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
            <Card.Content>
              <Text
                style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={2}
              >
                Barcode scanning is not supported on web browsers. Use the mobile app instead.
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Button
              mode="contained"
              onPress={handleScanAction}
              style={styles.button}
              buttonColor={colors.primary}
              textColor={isDarkMode ? '#FFFFFF' : '#212121'}
              disabled={showScanner || loading}
              labelStyle={styles.buttonLabel}
            >
              {scanned ? 'Scan Again' : 'Scan Barcode'}
            </Button>
            {showScanner && (
              <View style={styles.scannerContainer}>
                <BarCodeScanner
                  onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
                  style={styles.camera}
                  barCodeTypes={[
                    BarCodeScanner.Constants.BarCodeType.qr,
                    BarCodeScanner.Constants.BarCodeType.ean13,
                    BarCodeScanner.Constants.BarCodeType.code128,
                  ]}
                  scanInterval={100}
                  region={scanRegion}
                />
                <TouchableOpacity
                  style={styles.scanAreaOverlay}
                  onPress={handleSelectScanArea}
                  activeOpacity={0.7}
                >
                  <View style={styles.scanAreaBox} />
                </TouchableOpacity>
                <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]}>
                  <View style={styles.scanLineInner} />
                </Animated.View>
                <Button
                  mode="contained"
                  onPress={handleCancelScan}
                  style={styles.cancelButton}
                  buttonColor={colors.error}
                  textColor="#FFFFFF"
                  labelStyle={styles.buttonLabel}
                >
                  Cancel
                </Button>
              </View>
            )}
            {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />}
            {scanned && (
              <Card style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                <Card.Content>
                  <Text
                    style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    Scanned Barcode: {barcodeData || 'N/A'}
                  </Text>
                  {error ? (
                    <Text
                      style={[styles.error, { color: isDarkMode ? '#FF5555' : colors.error }]}
                      adjustsFontSizeToFit
                      numberOfLines={2}
                    >
                      {error}
                    </Text>
                  ) : (
                    <Text
                      style={[styles.success, { color: isDarkMode ? '#00FF00' : colors.accent }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      Success!
                    </Text>
                  )}
                </Card.Content>
              </Card>
            )}
          </>
        );
      case 'search':
        return (
          <>
            {fetchError && (
              <Text
                style={[styles.error, { color: isDarkMode ? '#FF5555' : colors.error }]}
                adjustsFontSizeToFit
                numberOfLines={2}
              >
                {fetchError}
              </Text>
            )}
            <TextInput
              placeholder="Search Barcodes..."
              value={searchBarcode}
              onChangeText={setSearchBarcode}
              style={[styles.searchBar, { backgroundColor: isDarkMode ? '#444' : '#fff', color: isDarkMode ? '#FFFFFF' : colors.text }]}
              placeholderTextColor={isDarkMode ? '#999' : '#666'}
              autoCapitalize="none"
              mode="outlined"
              outlineColor={isDarkMode ? '#555' : '#ccc'}
              activeOutlineColor={colors.primary}
            />
            <FlatList
              data={filteredBarcodes}
              keyExtractor={(item) => item._id || `barcode-${item.value}`}
              renderItem={({ item }) => (
                <Card key={item._id} style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Value: {item.value || 'N/A'}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points: {item.points ?? 0}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Timestamp: {item.scannedAt ? new Date(item.scannedAt).toLocaleString() : 'N/A'}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'Unknown'}</Text>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={() => (
                !loading && (
                  <Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No barcodes found.</Text>
                )
              )}
              contentContainerStyle={{ paddingBottom: 80 }}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </>
        );
      case 'barcode':
        return (
          <>
            {fetchError && (
              <Text
                style={[styles.error, { color: isDarkMode ? '#FF5555' : colors.error }]}
                adjustsFontSizeToFit
                numberOfLines={2}
              >
                {fetchError}
              </Text>
            )}
            <Text
              style={[styles.subtitle, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              Your Barcodes
            </Text>
            <FlatList
              data={memoizedBarcodes}
              keyExtractor={(item) => item._id || `barcode-${item.value}`}
              renderItem={({ item }) => (
                <Card key={item._id || index} style={[styles.card, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
                  <Card.Content>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Value: {item.value || 'N/A'}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>User: {item.userId?.name || 'Unknown'} ({item.userId?.mobile || 'N/A'})</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Points Awarded: {item.points ?? 0}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Timestamp: {item.scannedAt ? new Date(item.scannedAt).toLocaleString() : 'N/A'}</Text>
                    <Text style={[styles.cardText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Location: {item.location || 'N/A'}</Text>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={() => (
                !loading && (
                  <Text style={[styles.emptyText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>No barcodes scanned yet.</Text>
                )
              )}
              contentContainerStyle={{ paddingBottom: 80 }}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </>
        );
      default:
        return null;
    }
  }, [currentTab, user, admin, barcodes, filteredBarcodes, isDarkMode, colors, showScanner, scanned, barcodeData, error, loading, fetchError, handleScanAction, handleCancelScan, handleSelectScanArea, scanLineTranslate]);

  if (hasPermission === false) {
    return (
      <Text
        style={[styles.permissionText, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        No access to camera
      </Text>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <View style={styles.header}>
        <ThemeToggle style={styles.toggle} />
        <Button
          mode="contained"
          onPress={handleLogout}
          style={styles.logoutButton}
          buttonColor={colors.error}
          textColor="#FFFFFF"
          labelStyle={styles.buttonLabel}
        >
          Logout
        </Button>
      </View>
      <Text
        style={[styles.title, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        User Dashboard
      </Text>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
      <View style={[styles.tabBar, { backgroundColor: isDarkMode ? '#333' : colors.surface }]}>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'home' && styles.activeTab]} onPress={() => setCurrentTab('home')}>
          <MaterialIcons name="home" size={24} color={currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'home' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'scan' && styles.activeTab]} onPress={handleScanTabPress}>
          <MaterialIcons name="qr-code-scanner" size={24} color={currentTab === 'scan' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'scan' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'search' && styles.activeTab]} onPress={() => setCurrentTab('search')}>
          <MaterialIcons name="search" size={24} color={currentTab === 'search' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'search' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'barcode' && styles.activeTab]} onPress={() => setCurrentTab('barcode')}>
          <MaterialIcons name="qr-code" size={24} color={currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text)} />
          <Text style={[styles.tabText, { color: currentTab === 'barcode' ? (isDarkMode ? '#FFD700' : colors.primary) : (isDarkMode ? '#FFF' : colors.text) }]}>Barcodes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  toggle: {
    marginLeft: 10,
  },
  logoutButton: {
    borderRadius: 12,
    paddingVertical: 8,
    marginVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 16,
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '600',
    marginVertical: 20,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  profileCard: {
    marginVertical: 10,
    borderRadius: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    transform: [{ perspective: 1000 }, { rotateX: '2deg' }],
  },
  card: {
    marginVertical: 10,
    borderRadius: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  cardText: {
    fontSize: 16,
    marginVertical: 4,
    fontWeight: '500',
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  scannerContainer: {
    position: 'relative',
    marginTop: -10,
    marginBottom: 20,
  },
  camera: {
    height: 300,
    marginVertical: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  scanAreaOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanAreaBox: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  scanLine: {
    position: 'absolute',
    top: 50,
    left: '10%',
    width: '80%',
    height: 2,
    backgroundColor: 'red',
  },
  scanLineInner: {
    width: '20%',
    height: 4,
    backgroundColor: '#FF5555',
    alignSelf: 'center',
  },
  cancelButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    marginVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  button: {
    marginVertical: 15,
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonLabel: {
    fontSize: 14,
    textAlign: 'center',
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.7,
    paddingHorizontal: 5,
  },
  error: {
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  success: {
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  loading: {
    marginVertical: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginVertical: 10,
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  permissionText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    textShadowColor: '#000',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  searchBar: {
    marginBottom: 16,
    borderRadius: 25,
    paddingHorizontal: 10,
    height: 50,
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
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  tabText: {
    fontSize: 12,
    marginTop: 4,
  },
});