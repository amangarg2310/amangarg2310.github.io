import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Moon, Sun, Monitor, UserPlus, UserMinus, Star, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TierBadge } from '../components/TierBadge';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import type { TierType } from '../data/types';
import { useRoute } from '@react-navigation/native';
import { TIER_GRADIENT_COLORS } from '../theme/colors';

export function ProfileScreen() {
  const route = useRoute<any>();
  const userId = route.params?.id;
  const { user: currentUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'ratings' | 'diary'>('ratings');

  const isOwnProfile = !userId || userId === currentUser?.id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId || currentUser?.id],
    queryFn: () => api.users.profile(userId || currentUser!.id),
    enabled: !isOwnProfile || !!currentUser,
  });

  const { data: tries = [] } = useQuery({
    queryKey: ['tries'],
    queryFn: () => api.tries.mine({ limit: 50 }),
    enabled: isOwnProfile,
  });

  const followMutation = useMutation({
    mutationFn: () => api.users.toggleFollow(userId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-profile', userId] }),
  });

  const user = isOwnProfile ? currentUser : profile;
  const displayProfile = profile;

  if (isLoading || !user) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color="#9333ea" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const maxDNA = displayProfile?.taste_dna?.reduce((max, d) => Math.max(max, d.count), 0) || 1;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.profileHeader}>
          <Image source={{ uri: user.avatar || 'https://via.placeholder.com/80' }} style={s.avatar} contentFit="cover" />
          <Text style={s.username}>{user.username}</Text>
          {(user as any).bio ? <Text style={s.bio}>{(user as any).bio}</Text> : null}
          {(user as any).product_personality ? (
            <View style={s.personalityBadge}>
              <Text style={s.personalityText}>{(user as any).product_personality}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Rated', value: isOwnProfile ? currentUser?.products_rated : displayProfile?.products_rated },
            { label: 'Tier Lists', value: isOwnProfile ? currentUser?.tier_lists : displayProfile?.tier_lists },
            { label: 'Followers', value: isOwnProfile ? currentUser?.followers : displayProfile?.followers },
            { label: 'Following', value: isOwnProfile ? currentUser?.following : displayProfile?.following },
          ].map(stat => (
            <View key={stat.label} style={s.statItem}>
              <Text style={s.statValue}>{stat.value ?? 0}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Follow/Unfollow */}
        {!isOwnProfile && displayProfile && (
          <TouchableOpacity
            style={[s.followBtn, displayProfile.is_following && s.followBtnActive]}
            onPress={() => followMutation.mutate()}
          >
            {displayProfile.is_following ? <UserMinus size={16} color="#9333ea" /> : <UserPlus size={16} color="#fff" />}
            <Text style={[s.followText, displayProfile.is_following && s.followTextActive]}>
              {displayProfile.is_following ? 'Unfollow' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Taste DNA */}
        {displayProfile?.taste_dna && displayProfile.taste_dna.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Taste DNA</Text>
            {displayProfile.taste_dna.slice(0, 6).map(item => (
              <View key={item.category} style={s.dnaRow}>
                <Text style={s.dnaLabel}>{item.category}</Text>
                <View style={s.dnaBarBg}>
                  <LinearGradient
                    colors={['#a855f7', '#ec4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.dnaBarFill, { width: `${(item.count / maxDNA) * 100}%` as any }]}
                  />
                </View>
                <Text style={s.dnaCount}>{item.count}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tab, tab === 'ratings' && s.tabActive]} onPress={() => setTab('ratings')}>
            <Star size={14} color={tab === 'ratings' ? '#9333ea' : '#a3a3a3'} />
            <Text style={[s.tabText, tab === 'ratings' && s.tabTextActive]}>Ratings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'diary' && s.tabActive]} onPress={() => setTab('diary')}>
            <Calendar size={14} color={tab === 'diary' ? '#9333ea' : '#a3a3a3'} />
            <Text style={[s.tabText, tab === 'diary' && s.tabTextActive]}>Diary</Text>
          </TouchableOpacity>
        </View>

        {tab === 'ratings' && displayProfile?.recent_ratings?.map(r => (
          <View key={r.product_id + r.created_at} style={s.ratingItem}>
            <Image source={{ uri: r.image_url }} style={s.ratingImage} contentFit="cover" />
            <View style={s.ratingInfo}>
              <Text style={s.ratingName} numberOfLines={1}>{r.name}</Text>
              <Text style={s.ratingBrand}>{r.brand_name}</Text>
              <Text style={s.ratingDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
            </View>
            <TierBadge tier={r.tier as TierType} size="sm" showEmoji={false} />
          </View>
        ))}

        {tab === 'diary' && tries.map(t => (
          <View key={t.id} style={s.tryItem}>
            <Image source={{ uri: t.product_image }} style={s.tryImage} contentFit="cover" />
            <View style={s.tryInfo}>
              <Text style={s.tryName} numberOfLines={1}>{t.product_name}</Text>
              <Text style={s.tryBrand}>{t.brand_name}</Text>
              {t.notes ? <Text style={s.tryNotes} numberOfLines={2}>{t.notes}</Text> : null}
              <Text style={s.tryDate}>{new Date(t.created_at).toLocaleDateString()}</Text>
            </View>
            {t.tier && <TierBadge tier={t.tier as TierType} size="sm" showEmoji={false} />}
          </View>
        ))}

        {/* Settings for own profile */}
        {isOwnProfile && (
          <View style={s.settingsSection}>
            <Text style={s.sectionTitle}>Settings</Text>
            <View style={s.themeRow}>
              <Text style={s.themeLabel}>Theme</Text>
              <View style={s.themeButtons}>
                {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([t, Icon]) => (
                  <TouchableOpacity key={t} style={[s.themeBtn, theme === t && s.themeBtnActive]} onPress={() => setTheme(t)}>
                    <Icon size={16} color={theme === t ? '#9333ea' : '#a3a3a3'} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={logout}>
              <LogOut size={16} color="#ef4444" />
              <Text style={s.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { paddingTop: 16 },
  profileHeader: { alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e5e5', marginBottom: 12 },
  username: { fontSize: 22, fontWeight: '700', color: '#171717' },
  bio: { fontSize: 14, color: '#737373', textAlign: 'center', marginTop: 4 },
  personalityBadge: { marginTop: 8, backgroundColor: '#faf5ff', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#e9d5ff' },
  personalityText: { fontSize: 12, fontWeight: '600', color: '#9333ea' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginBottom: 16 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#171717' },
  statLabel: { fontSize: 11, color: '#a3a3a3', marginTop: 2 },
  followBtn: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#9333ea', marginBottom: 16 },
  followBtnActive: { backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff' },
  followText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  followTextActive: { color: '#9333ea' },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#171717', marginBottom: 12 },
  dnaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dnaLabel: { width: 80, fontSize: 12, color: '#525252' },
  dnaBarBg: { flex: 1, height: 8, backgroundColor: '#f5f5f5', borderRadius: 4, overflow: 'hidden' },
  dnaBarFill: { height: '100%', borderRadius: 4 },
  dnaCount: { width: 24, fontSize: 12, fontWeight: '600', color: '#737373', textAlign: 'right' },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#f5f5f5', borderRadius: 12, padding: 2, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '500', color: '#a3a3a3' },
  tabTextActive: { color: '#171717' },
  ratingItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 12 },
  ratingImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f5f5f5' },
  ratingInfo: { flex: 1 },
  ratingName: { fontSize: 14, fontWeight: '600', color: '#171717' },
  ratingBrand: { fontSize: 12, color: '#737373' },
  ratingDate: { fontSize: 11, color: '#a3a3a3', marginTop: 2 },
  tryItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 12 },
  tryImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f5f5f5' },
  tryInfo: { flex: 1 },
  tryName: { fontSize: 14, fontWeight: '600', color: '#171717' },
  tryBrand: { fontSize: 12, color: '#737373' },
  tryNotes: { fontSize: 12, color: '#525252', marginTop: 2 },
  tryDate: { fontSize: 11, color: '#a3a3a3', marginTop: 2 },
  settingsSection: { paddingHorizontal: 16, marginTop: 24 },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  themeLabel: { fontSize: 14, fontWeight: '500', color: '#171717' },
  themeButtons: { flexDirection: 'row', gap: 8 },
  themeBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  themeBtnActive: { backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  logoutText: { fontSize: 14, fontWeight: '500', color: '#ef4444' },
});
