import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  return (
    <View style={styles.centerContent}>
      <Ionicons name="person-circle-outline" size={100} color="#ccc" />
      <Text style={styles.profileEmail}>{session?.user?.email}</Text>
      <TouchableOpacity style={styles.buttonSecondary} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonTextSecondary}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  profileEmail: { fontSize: 18, marginTop: 10, fontWeight: '500', color: '#333' },
  buttonSecondary: { marginTop: 30, backgroundColor: 'transparent', padding: 15, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', width: 200 },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
});