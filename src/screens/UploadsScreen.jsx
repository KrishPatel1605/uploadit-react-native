import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Modal, SafeAreaView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
// import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { generateCode } from '../utils/helpers';

export default function UploadsScreen() {
  const [files, setFiles] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchFiles(session.user.email);
    });
  }, []);

  const fetchFiles = async (email) => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('uploader_email', email)
      .order('created_at', { ascending: false });
    
    if (data) setFiles(data);
    if (error) Alert.alert('Error', error.message);
    setRefreshing(false);
  };

const handleUpload = async () => {
  try {
    const result = await DocumentPicker.getDocumentAsync({ 
      copyToCacheDirectory: true,
      type: '*/*'
    });
    
    if (result.canceled) return;

    const file = result.assets[0];
    const fileExt = file.name.split('.').pop();
    const uniquePath = `uploads/${session.user.id}/${Date.now()}.${fileExt}`;
    const shortCode = generateCode();

    // Read file as base64 and convert to ArrayBuffer
    const fileInfo = await FileSystem.getInfoAsync(file.uri);
    if (!fileInfo.exists) throw new Error('File not found');

    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: 'base64'
    });

    // Convert base64 to byte array
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const { error: uploadError } = await supabase.storage
      .from('uploadit')
      .upload(uniquePath, byteArray, {
        contentType: file.mimeType || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase.from('files').insert({
      uploader_email: session.user.email,
      file_path: uniquePath,
      original_name: file.name,
      download_code: shortCode,
    });

    if (dbError) throw dbError;

    Alert.alert('Success', `File uploaded! Code: ${shortCode}`);
    fetchFiles(session.user.email);
  } catch (e) {
    console.log('Upload error:', e);
    Alert.alert('Upload Failed', e.message || 'Unknown error');
  }
};

  const handleDelete = async (id, path) => {
    Alert.alert("Delete File", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          await supabase.from('files').delete().eq('id', id);
          await supabase.storage.from('uploadit').remove([path]);
          fetchFiles(session.user.email);
      }}
    ]);
  };

  const handleRename = (id) => {
    Alert.prompt('Rename File', 'Enter new name', async (text) => {
      if(text) {
        await supabase.from('files').update({ original_name: text }).eq('id', id);
        fetchFiles(session.user.email);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Uploads</Text>
        <TouchableOpacity onPress={handleUpload}>
           <Ionicons name="add-circle" size={32} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => fetchFiles(session.user.email)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No files uploaded yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
               <Ionicons name="document-text-outline" size={24} color="#333" />
               <Text style={styles.fileName} numberOfLines={1}>{item.original_name}</Text>
            </View>
            <View style={styles.codeContainer}>
               <Text style={styles.codeLabel}>CODE: </Text>
               <Text style={styles.codeValue}>{item.download_code}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedFile(item); setModalVisible(true); }}>
                <Ionicons name="qr-code-outline" size={20} color="#007AFF" />
                <Text style={styles.actionText}>QR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleRename(item.id)}>
                <Ionicons name="pencil-outline" size={20} color="#666" />
                <Text style={styles.actionTextSecondary}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id, item.file_path)}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                <Text style={[styles.actionTextSecondary, {color: '#FF3B30'}]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            {selectedFile && (
              <>
                <Text style={styles.modalTitle}>Scan to Download</Text>
                <View style={styles.qrContainer}>
                  <QRCode value={selectedFile.download_code} size={200} />
                </View>
                <Text style={styles.modalCode}>{selectedFile.download_code}</Text>
                <TouchableOpacity style={styles.buttonPrimary} onPress={() => Clipboard.setStringAsync(selectedFile.download_code)}>
                  <Text style={styles.buttonText}>Copy Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonSecondary, {marginTop: 10}]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.buttonTextSecondary}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  listContent: { padding: 15 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  fileName: { fontSize: 16, fontWeight: '600', marginLeft: 10, flex: 1 },
  codeContainer: { backgroundColor: '#f0f0f0', padding: 8, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10, flexDirection: 'row' },
  codeLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  codeValue: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15, borderTopWidth: 1, borderColor: '#eee', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center' },
  actionText: { marginLeft: 5, color: '#007AFF', fontSize: 14, fontWeight: '500' },
  actionTextSecondary: { marginLeft: 5, color: '#666', fontSize: 14, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalView: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 35, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  qrContainer: { padding: 10, backgroundColor: '#fff', borderRadius: 10, shadowOpacity: 0.1, elevation: 2, marginBottom: 20 },
  modalCode: { fontSize: 32, fontWeight: 'bold', letterSpacing: 2, marginBottom: 20, color: '#333' },
  buttonPrimary: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: { backgroundColor: 'transparent', padding: 15, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', width: '100%' },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
});