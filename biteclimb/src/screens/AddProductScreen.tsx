import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, CheckCircle2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import type { CategoryData, BrandData } from '../api/client';
import { useNavigation } from '@react-navigation/native';

export function AddProductScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<BrandData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceRange, setPriceRange] = useState('');
  const [size, setSize] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => api.brands.list() });

  const filteredBrands = brandSearch.length > 0
    ? brands.filter((b: BrandData) => b.name.toLowerCase().includes(brandSearch.toLowerCase())).slice(0, 5)
    : [];

  const createMutation = useMutation({
    mutationFn: () => api.products.create({
      name,
      brand_id: selectedBrand?.id || '',
      category_id: selectedCategory || undefined,
      price_range: priceRange || undefined,
      size: size || undefined,
      description: description || undefined,
      image_url: imageUrl || undefined,
    }),
    onSuccess: (data) => setSuccess(data),
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create product'),
  });

  if (success) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.successWrap}>
          <CheckCircle2 size={48} color="#22c55e" />
          <Text style={s.successTitle}>Product Added!</Text>
          <Text style={s.successName}>{success.name}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ProductDetail', { id: success.id })} activeOpacity={0.8}>
            <LinearGradient colors={['#9333ea', '#7e22ce']} style={s.viewBtn}>
              <Text style={s.viewBtnText}>View Product</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setSuccess(null); setName(''); setBrandSearch(''); setSelectedBrand(null); }} style={{ marginTop: 12 }}>
            <Text style={s.addAnother}>Add Another</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <ChevronLeft size={24} color="#171717" />
            </TouchableOpacity>
            <Text style={s.title}>Add Product</Text>
          </View>

          <Text style={s.label}>Product Name *</Text>
          <TextInput style={s.input} placeholder="e.g., Doritos Cool Ranch" placeholderTextColor="#a3a3a3" value={name} onChangeText={setName} />

          <Text style={s.label}>Brand *</Text>
          <TextInput style={s.input} placeholder="Search brands..." placeholderTextColor="#a3a3a3" value={selectedBrand ? selectedBrand.name : brandSearch} onChangeText={t => { setBrandSearch(t); setSelectedBrand(null); }} />
          {filteredBrands.length > 0 && !selectedBrand && (
            <View style={s.dropdown}>
              {filteredBrands.map((b: BrandData) => (
                <TouchableOpacity key={b.id} style={s.dropdownItem} onPress={() => { setSelectedBrand(b); setBrandSearch(''); }}>
                  <Text style={s.dropdownText}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={s.label}>Category</Text>
          <View style={s.catGrid}>
            {categories.map((cat: CategoryData) => (
              <TouchableOpacity key={cat.id} style={[s.catCard, selectedCategory === cat.id && s.catCardSelected]} onPress={() => setSelectedCategory(cat.id)}>
                <Text style={s.catEmoji}>{cat.emoji}</Text>
                <Text style={s.catName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Price Range</Text>
          <View style={s.priceRow}>
            {['$', '$$', '$$$'].map(p => (
              <TouchableOpacity key={p} style={[s.priceBtn, priceRange === p && s.priceBtnActive]} onPress={() => setPriceRange(p)}>
                <Text style={[s.priceText, priceRange === p && s.priceTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Size (optional)</Text>
          <TextInput style={s.input} placeholder="e.g., 10 oz, 12 pack" placeholderTextColor="#a3a3a3" value={size} onChangeText={setSize} />

          <Text style={s.label}>Description (optional)</Text>
          <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Brief description..." placeholderTextColor="#a3a3a3" value={description} onChangeText={setDescription} multiline />

          <Text style={s.label}>Image URL (optional)</Text>
          <TextInput style={s.input} placeholder="https://..." placeholderTextColor="#a3a3a3" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" />
          {imageUrl.length > 10 && <Image source={{ uri: imageUrl }} style={s.preview} contentFit="cover" />}

          <TouchableOpacity
            onPress={() => createMutation.mutate()}
            disabled={!name.trim() || !selectedBrand || createMutation.isPending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={name.trim() && selectedBrand ? ['#9333ea', '#7e22ce'] : ['#d4d4d4', '#a3a3a3']}
              style={s.submitBtn}
            >
              {createMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitText}>Add Product</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#171717' },
  label: { fontSize: 13, fontWeight: '600', color: '#404040', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#171717' },
  dropdown: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, marginTop: -4, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dropdownText: { fontSize: 14, color: '#171717' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: '#e5e5e5', backgroundColor: '#fff' },
  catCardSelected: { borderColor: '#9333ea', backgroundColor: '#faf5ff' },
  catEmoji: { fontSize: 20 },
  catName: { fontSize: 13, fontWeight: '500', color: '#171717', flex: 1 },
  priceRow: { flexDirection: 'row', gap: 8 },
  priceBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: '#e5e5e5', backgroundColor: '#fff', alignItems: 'center' },
  priceBtnActive: { borderColor: '#9333ea', backgroundColor: '#faf5ff' },
  priceText: { fontSize: 16, fontWeight: '600', color: '#737373' },
  priceTextActive: { color: '#9333ea' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginTop: 8, backgroundColor: '#f5f5f5' },
  submitBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#171717', marginTop: 16 },
  successName: { fontSize: 16, color: '#737373', marginTop: 4, marginBottom: 24 },
  viewBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  viewBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  addAnother: { fontSize: 14, color: '#9333ea', fontWeight: '500' },
});
