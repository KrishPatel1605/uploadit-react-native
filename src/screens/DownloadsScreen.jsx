import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, SafeAreaView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function DownloadsScreen() {
  const [downloadTab, setDownloadTab] = useState('scan');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [localFiles, setLocalFiles] = useState([]);

  useEffect(() => {
    loadLocalFiles();
  }, [downloadTab]);

  const loadLocalFiles = async () => {
    const existing = await AsyncStorage.getItem('downloads');
    if (existing) setLocalFiles(JSON.parse(existing));
  };

  const handleDownload = async (code) => {
    if (!code) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('files').select('*').eq('download_code', code).single();
      if (error || !data) throw new Error('File not found or invalid code.');

      const { data: signedData, error: signError } = await supabase.storage.from('uploads').createSignedUrl(data.file_path, 300);
      if (signError) throw signError;

      const fileUri = FileSystem.documentDirectory + data.original_name;
      const downloadRes = await FileSystem.downloadAsync(signedData.signedUrl, fileUri);

      const newFile = {
        id: Date.now().toString(),
        name: data.original_name,
        uri: downloadRes.uri,
        date: new Date().toLocaleDateString()
      };
      
      const existing = await AsyncStorage.getItem('downloads');
      const downloads = existing ? JSON.parse(existing) : [];
      downloads.unshift(newFile);
      await AsyncStorage.setItem('downloads', JSON.stringify(downloads));

      Alert.alert('Success', 'File downloaded successfully!', [
        { text: 'Open', onPress: () => shareAsync(downloadRes.uri) },
        { text: 'OK' }
      ]);
      setManualCode('');

    } catch (e) {
      Alert.alert('Download Error', e.message);
    } finally {
      setLoading(false);
      setScanned(false);
    }
  };

  const deleteLocalFile = async (id, uri) => {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      const updated = localFiles.filter(f => f.id !== id);
      setLocalFiles(updated);
      await AsyncStorage.setItem('downloads', JSON.stringify(updated));
    } catch (e) {
      console.log(e);
    }
  };

  const renderContent = () => {
    if (downloadTab === 'scan') {
      if (!permission) return <View />;
      if (!permission.granted) {
        return (
          <View style={styles.centerContent}>
            <Text style={{marginBottom: 20}}>We need your permission to show the camera</Text>
            <TouchableOpacity style={styles.buttonPrimary} onPress={requestPermission}>
                <Text style={styles.buttonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : ({ data }) => {
              setScanned(true);
              Alert.alert("Code Found", `Download file ${data}?`, [
                { text: 'Cancel', onPress: () => setScanned(false) },
                { text: 'Download', onPress: () => handleDownload(data) }
              ]);
            }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
          <View style={styles.scanOverlay}>
            <Text style={styles.scanText}>Scan a QR Code to Download</Text>
          </View>
        </View>
      );
    }

    if (downloadTab === 'manual') {
      return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.centerContent}>
          <Text style={styles.headerTitle}>Enter Download Code</Text>
          <TextInput
            style={[styles.input, {textAlign: 'center', fontSize: 24, letterSpacing: 4, width: '80%'}]}
            placeholder="XXXXXX"
            value={manualCode}
            onChangeText={(t) => setManualCode(t.toUpperCase())}
            maxLength={8}
          />
          <TouchableOpacity 
            style={[styles.buttonPrimary, {width: '80%', marginTop: 20}]} 
            onPress={() => handleDownload(manualCode)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Download</Text>}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      );
    }

    if (downloadTab === 'list') {
      return (
        <FlatList
          data={localFiles}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Text style={styles.emptyText}>No downloads yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                 <Ionicons name="document" size={24} color="#007AFF" />
                 <Text style={styles.fileName}>{item.name}</Text>
              </View>
              <Text style={{color: '#888', marginBottom: 10}}>Downloaded: {item.date}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => shareAsync(item.uri)}>
                   <Text style={styles.actionText}>Open / Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => deleteLocalFile(item.id, item.uri)}>
                   <Text style={[styles.actionText, {color: 'red'}]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabBar}>
        {['scan', 'manual', 'list'].map(tab => (
           <TouchableOpacity 
            key={tab}
            style={[styles.tabItem, downloadTab === tab && styles.tabItemActive]} 
            onPress={() => setDownloadTab(tab)}>
            <Text style={[styles.tabText, downloadTab === tab && styles.tabTextActive]}>
                {tab === 'scan' ? 'Scan QR' : tab === 'manual' ? 'Enter Code' : 'My Files'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{flex: 1, backgroundColor: '#f4f4f4'}}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  input: { borderBottomWidth: 1, borderColor: '#ddd', height: 50, fontSize: 16 },
  buttonPrimary: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#e0e0e0' },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderColor: 'transparent' },
  tabItemActive: { borderColor: '#007AFF' },
  tabText: { fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#007AFF' },
  cameraContainer: { flex: 1 },
  scanOverlay: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  scanText: { color: 'white', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8, overflow: 'hidden' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, margin: 15, marginBottom: 0, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  fileName: { fontSize: 16, fontWeight: '600', marginLeft: 10, flex: 1 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15, borderTopWidth: 1, borderColor: '#eee', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center' },
  actionText: { marginLeft: 5, color: '#007AFF', fontSize: 14, fontWeight: '500' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888' },
});