import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roomsApi } from '../api/rooms';
import { useView } from '../context/ViewContext';
import type { CreateRoomRequest, JoinRoomRequest, Room } from '@squadqueue/shared';

const ROOMS_QUERY_KEY = ['rooms'];

export function useRooms() {
  const { setRooms } = useView();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: roomsApi.list });

  useEffect(() => {
    if (query.data) setRooms(query.data.rooms);
  }, [query.data, setRooms]);

  // create/join already return the full Room in their response - merge it straight into the
  // cache instead of refetching the whole list for a change we already have the delta for.
  // Upsert by id rather than a blind append: joining a room you're already a member of (the join
  // endpoint is idempotent) would otherwise duplicate that room in the list.
  function addRoomToCache(room: Room) {
    queryClient.setQueryData<{ rooms: Room[] }>(ROOMS_QUERY_KEY, (old) => {
      if (!old) return old;
      const exists = old.rooms.some((r) => r.id === room.id);
      return { rooms: exists ? old.rooms.map((r) => (r.id === room.id ? room : r)) : [...old.rooms, room] };
    });
  }

  const createRoom = useMutation({
    mutationFn: (body: CreateRoomRequest) => roomsApi.create(body),
    onSuccess: ({ room }) => addRoomToCache(room),
  });

  const joinRoom = useMutation({
    mutationFn: (body: JoinRoomRequest) => roomsApi.join(body),
    onSuccess: ({ room }) => addRoomToCache(room),
  });

  return {
    rooms: query.data?.rooms ?? [],
    isLoading: query.isLoading,
    createRoom,
    joinRoom,
  };
}
