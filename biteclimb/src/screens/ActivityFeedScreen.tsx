import React from 'react';
import { View, Text, TouchableOpacity, FlatList, SafeAreaView, StyleSheet, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Star, MessageSquare, UserPlus, ListPlus, CheckCircle2, Activity } from 'lucide-react-native';
import { api } from '../api/client';
import type { ActivityData } from '../api/client';
import { useNavigation } from '@react-navigation/native';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'rating': return <Star size={14} color="#eab308" />;
    case 'review': return <MessageSquare size={14} color="#3b82f6" />;
    case 'follow': return <UserPlus size={14} color="#22c55e" />;
    case 'tier_list': return <ListPlus size={14} color="#9333ea" />;
    case 'try': return <CheckCircle2 size={14} color="#f97316" />;
    default: return <Activity size={14} color="#a3a3a3" />;
  }
}

function getActivityText(item: ActivityData): string {
  switch (item.type) {
    case 'rating': return `rated ${item.target_name}`;
    case 'review': return `reviewed ${item.target_name}`;
    case 'follow': return `followed ${item.target_name}`;
    case 'tier_list': return `created tier list "${item.target_name}"`;
    case 'try': return `tried ${item.target_name}`;
    default: return item.target_name;
  }
}

export function ActivityFeedScreen() {
  const navigation = useNavigation<any>();
  const { data: feed = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.feed(),
  });

  const renderItem = ({ item }: { item: ActivityData }) => (
    <TouchableOpacity
      style={s.item}
      activeOpacity={0.7}
      onPress={() => {
        if (item.type === 'follow') navigation.navigate('UserProfile', { id: item.target_id });
        else if (item.type !== 'tier_list') navigation.navigate('ProductDetail', { id: item.target_id });
      }}
    >
      <Image source={{ uri: item.avatar }} style={s.avatar} contentFit="cover" />
      <View style={s.itemContent}>
        <View style={s.itemRow}>
          <Text style={s.username}>{item.username}</Text>
          {getActivityIcon(item.type)}
        </View>
        <Text style={s.activityText}>{getActivityText(item)}</Text>
        <Text style={s.time}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Activity Feed</Text>
        <Text style={s.subtitle}>From people you follow</Text>
      </View>
      <FlatList
        data={feed}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#9333ea" />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={s.empty}>
              <Activity size={32} color="#d4d4d4" />
              <Text style={s.emptyTitle}>No activity yet</Text>
              <Text style={s.emptySub}>Follow some users to see their activity here</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#171717' },
  subtitle: { fontSize: 12, color: '#737373', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  item: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#e5e5e5' },
  itemContent: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  username: { fontSize: 14, fontWeight: '600', color: '#171717' },
  activityText: { fontSize: 13, color: '#525252' },
  time: { fontSize: 11, color: '#a3a3a3', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#737373', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#a3a3a3', marginTop: 4 },
});
