import React, { useState, useContext } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler } from 'react-native';
import { TextInput, Button, Text, useTheme, IconButton } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

// Backend API base URL

// const BASE_URL = 'http://localhost:5002';
const BASE_URL = 'http://52.72.238.42:5002';


export default function LoginScreen({ navigation, route }) {
  // Theme and context for dark/light mode
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);

  // State variables for form inputs and UI
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(route.params?.role || 'user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // Password visibility toggle

  // Handle user login
  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${BASE_URL}/login`, {
        mobile,
        password,
        role,
      });
      // Store token and user data in AsyncStorage
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify({
        id: response.data.user.id,
        name: response.data.user.name,
        mobile: response.data.user.mobile,
        role: response.data.user.role,
      }));
      setError('');
      Toast.show({
        type: 'success',
        text1: 'Login Successful',
        text2: `Welcome, ${response.data.user.name}!`,
      });
      // Redirect based on user role
      if (response.data.user.role === 'admin') {
        navigation.replace('AdminDashboard');
      } else if (response.data.user.role === 'superadmin') {
        navigation.replace('SuperAdminDashboard');
      } else {
        navigation.replace('UserDashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: err.response?.data?.message || 'Please check your credentials.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Disable hardware back button and navigate to Home
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        navigation.navigate('Home');
        return true;
      };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [navigation])
  );

  // Render the Login UI
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Theme toggle button */}
      <ThemeToggle style={styles.toggle} />
      {/* Login title */}
      <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Login</Text>
      {/* Mobile number input */}
      <TextInput
        label="Mobile Number"
        value={mobile}
        onChangeText={setMobile}
        style={styles.input}
        theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
        mode="outlined"
        keyboardType="phone-pad"
      />
      {/* Password input with visibility toggle */}
      <View style={styles.passwordContainer}>
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          style={[styles.input, styles.passwordInput]}
          theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
          mode="outlined"
        />
        <IconButton
          icon={showPassword ? 'eye-off' : 'eye'}
          color={isDarkMode ? '#FFFFFF' : colors.text}
          size={24}
          onPress={() => setShowPassword(!showPassword)}
          style={styles.eyeIcon}
        />
      </View>
      {/* Role selection picker */}
      <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
        <Picker
          selectedValue={role}
          onValueChange={(itemValue) => setRole(itemValue)}
          style={[styles.picker, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
          dropdownIconColor={isDarkMode ? '#FFFFFF' : colors.text}
        >
          <Picker.Item label="User" value="user" />
          <Picker.Item label="Admin" value="admin" />
          {/* <Picker.Item label="Super Admin" value="superadmin" /> */}
        </Picker>
      </View>
      {/* Error message */}
      {error ? <Text style={[styles.error, { color: isDarkMode ? '#FF5555' : colors.error }]}>{error}</Text> : null}
      {/* Loading indicator or login button */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
      ) : (
        <Button
          mode="contained"
          onPress={handleLogin}
          style={styles.button}
          buttonColor={colors.primary}
          textColor={isDarkMode ? '#FFFFFF' : '#212121'}
          elevation={5}
        >
          Login
        </Button>
      )}
      {/* Back to Home button */}
      <Button
        mode="outlined"
        onPress={() => navigation.navigate('Home')}
        style={styles.button}
        textColor={isDarkMode ? '#FFFFFF' : colors.text}
        elevation={2}
      >
        Back to Home
      </Button>
    </View>
  );
}

// Styles for the Login UI
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  toggle: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  input: {
    marginVertical: 15,
    backgroundColor: 'transparent',
    borderRadius: 8,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  passwordInput: {
    flex: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: 10,
  },
  pickerContainer: {
    width: '100%',
    borderRadius: 12,
    elevation: 4,
    marginVertical: 15,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  button: {
    marginVertical: 15,
    borderRadius: 12,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  error: {
    textAlign: 'center',
    marginVertical: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  loading: {
    marginVertical: 20,
  },
});