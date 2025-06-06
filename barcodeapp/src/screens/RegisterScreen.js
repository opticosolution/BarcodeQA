import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Dimensions, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { TextInput, Button, useTheme } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import { Ionicons } from '@expo/vector-icons';


// const BASE_URL = 'http://localhost:5002';
const BASE_URL = 'http://52.72.238.42:5002';
// 

const { width } = Dimensions.get('window');

export default function Register({ navigation }) {
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('user');
  const [location, setLocation] = useState('');
  const [admins, setAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetch admins when role is 'user'
  useEffect(() => {
    if (role === 'user') {
      const fetchAdmins = async () => {
        setLoading(true);
        try {
          const response = await axios.get(`${BASE_URL}/admins`);
          setAdmins(response.data);
        } catch (error) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Failed to fetch admins',
          });
        } finally {
          setLoading(false);
        }
      };
      fetchAdmins();
    } else {
      setAdmins([]);
      setSelectedAdmin('');
    }
  }, [role]);

  const handleRegister = async () => {
    setLoading(true);
    try {
      if (password !== confirmPassword) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Password did not match',
        });
        return;
      }
      const payload = {
        name,
        mobile,
        password,
        confirmPassword,
        role,
        location,
        ...(role === 'user' && { adminId: selectedAdmin }),
      };
      const response = await axios.post(`${BASE_URL}/register`, payload);
      Toast.show({
        type: 'success',
        text1: 'Registration Successful',
        text2: response.data.message,
      });
      navigation.navigate('Home');
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Registration Failed',
        text2: error.response?.data?.message || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    navigation.navigate('Home');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <ThemeToggle style={styles.toggle} />
          </View>
          <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Register</Text>
          <TextInput
            label="Name"
            value={name}
            onChangeText={setName}
            style={styles.input}
            theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
            mode="outlined"
          />
          <TextInput
            label="Mobile Number"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            style={styles.input}
            theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
            mode="outlined"
          />
          <View style={styles.passwordContainer}>
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              style={[styles.input, { flex: 1 }]}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={24}
                color={isDarkMode ? '#FFFFFF' : colors.text}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.passwordContainer}>
            <TextInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              style={[styles.input, { flex: 1 }]}
              theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
              mode="outlined"
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off' : 'eye'}
                size={24}
                color={isDarkMode ? '#FFFFFF' : colors.text}
              />
            </TouchableOpacity>
          </View>
          <TextInput
            label="Location"
            value={location}
            onChangeText={setLocation}
            style={styles.input}
            theme={{ colors: { text: isDarkMode ? '#FFFFFF' : colors.text, primary: colors.primary } }}
            mode="outlined"
          />
          <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
            <Picker
              selectedValue={role}
              onValueChange={(itemValue) => setRole(itemValue)}
              style={[styles.picker, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
              dropdownIconColor={isDarkMode ? '#FFFFFF' : colors.text}
            >
              <Picker.Item label="User" value="user" />
              <Picker.Item label="Admin" value="admin" />
            </Picker>
          </View>
          {role === 'user' && (
            <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
              <Picker
                selectedValue={selectedAdmin}
                onValueChange={(itemValue) => setSelectedAdmin(itemValue)}
                style={[styles.picker, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
                dropdownIconColor={isDarkMode ? '#FFFFFF' : colors.text}
              >
                <Picker.Item label="Select Admin" value="" />
                {admins.map((admin) => (
                  <Picker.Item
                    key={admin._id}
                    label={`${admin.name} (${admin.uniqueCode || 'N/A'})`}
                    value={admin._id}
                  />
                ))}
              </Picker>
            </View>
          )}
          <Button
            mode="contained"
            onPress={handleRegister}
            style={styles.button}
            buttonColor={colors.primary}
            textColor={isDarkMode ? '#FFFFFF' : '#212121'}
            loading={loading}
            disabled={loading}
            elevation={5}
          >
            Register
          </Button>
          <Button
            mode="outlined"
            onPress={handleLoginRedirect}
            style={styles.button}
            textColor={isDarkMode ? '#FFFFFF' : colors.text}
            elevation={5}
          >
            Already have an account? Login
          </Button>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 20,
  },
  toggle: {
    marginRight: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  input: {
    marginVertical: 10,
    borderRadius: 8,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  eyeIcon: {
    padding: 10,
  },
  pickerContainer: {
    width: '100%',
    borderRadius: 12,
    elevation: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  button: {
    marginVertical: 10,
    borderRadius: 12,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    width: width > 600 ? '40%' : '100%',
  },
});