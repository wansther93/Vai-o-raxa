import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { compressBase64Image } from '../lib/imageUtils';

export type ProfileCardTheme = 'cyberpunk' | 'shrine' | 'dark_fantasy' | 'adventure' | 'cosmic';

export type OtakuArchetype = 
  | 'strategist'
  | 'nomad'
  | 'noble_heart'
  | 'night_philosopher'
  | 'chaos_hunter'
  | 'peace_guardian';

export interface HonorPillar {
  animeId: string;
  animeTitle: string;
  coverUrl?: string;
  label: string;
  rating?: number;
}

export interface UserProfile {
  userId: string;
  customAvatarUrl?: string;
  customBannerUrl?: string;
  isPublicList?: boolean;
  publicUsername?: string;
  publicBio?: string;
  honoraryTitle?: string; // Título honorário personalizado
  email?: string;
  isDeveloperAdmin?: boolean;
  usernameLastChangedAt?: string;
  featuredBadges?: string[]; // IDs das insígnias equipadas no perfil
  favoriteAnimeIds?: string[]; // IDs/títulos dos animes favoritos em destaque
  following?: string[]; // Lista de userIds ou nicks de amigos seguidos
  followersCount?: number;
  updatedAt?: string;
  // Novos campos da Crônica Otaku / Passaporte
  cardTheme?: ProfileCardTheme;
  archetype?: OtakuArchetype;
  honorPillars?: HonorPillar[];
  quote?: string;
}

const LOCAL_STORAGE_KEY_PREFIX = 'wanime_user_profile_';
const LOCAL_FOLLOWING_KEY_PREFIX = 'wanime_following_';

/**
 * Assinatura Criptográfica Unidirecional (SHA-256) do Administrador Mestre do Sistema
 * O e-mail nunca é exposto em texto aberto no código-fonte nem nos pacotes compilados da aplicação.
 */
const MASTER_ADMIN_HASH = '2b9cdc4a80571e07e5c24bd41315e1db5e686ed80dda7f820a1913b2a3439ca4';

function calculateSHA256Sync(str: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = new TextEncoder().encode(str);
  const bitLen = bytes.length * 8;
  const numBlocks = ((bytes.length + 8) >> 6) + 1;
  const blocks = new Uint32Array(numBlocks * 16);
  for (let i = 0; i < bytes.length; i++) {
    blocks[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  blocks[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  blocks[numBlocks * 16 - 1] = bitLen;
  for (let b = 0; b < numBlocks; b++) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++) W[t] = blocks[b * 16 + t];
    for (let t = 16; t < 64; t++) {
      const s0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
      const s1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [A, B, C, D, E, F, G, Hh] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
      const ch = (E & F) ^ ((~E) & G);
      const temp1 = (Hh + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
      const maj = (A & B) ^ (A & C) ^ (B & C);
      const temp2 = (S0 + maj) >>> 0;
      Hh = G; G = F; F = E; E = (D + temp1) >>> 0; D = C; C = B; B = A; A = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + A) >>> 0; H[1] = (H[1] + B) >>> 0; H[2] = (H[2] + C) >>> 0; H[3] = (H[3] + D) >>> 0;
    H[4] = (H[4] + E) >>> 0; H[5] = (H[5] + F) >>> 0; H[6] = (H[6] + G) >>> 0; H[7] = (H[7] + Hh) >>> 0;
  }
  return Array.from(H).map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const isDeveloperEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return calculateSHA256Sync(normalized) === MASTER_ADMIN_HASH;
};

/**
 * Sincroniza o UID do Administrador Mestre na coleção protegida 'admins' do Firestore
 */
export async function syncMasterAdminPrivilege(userId: string, email?: string | null): Promise<boolean> {
  if (!userId || !email) return false;
  if (!isDeveloperEmail(email)) return false;
  try {
    const adminDocRef = doc(db, 'admins', userId);
    await setDoc(adminDocRef, {
      role: 'admin',
      claimedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normaliza um username para comparação única (minúsculo, sem @ e caracteres limpos)
 */
export const normalizeUsername = (username: string): string => {
  return (username || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_-]/g, '');
};

/**
 * Verifica se um Nickname (publicUsername) está disponível para uso
 */
export const checkUsernameAvailability = async (
  desiredUsername: string,
  currentUserId: string,
  currentUserEmail?: string
): Promise<{ available: boolean; error?: string }> => {
  const clean = normalizeUsername(desiredUsername);
  if (!clean || clean.length < 2) {
    return { available: false, error: 'O Nick deve ter pelo menos 2 caracteres.' };
  }

  const effectiveEmail = (
    currentUserEmail || 
    auth.currentUser?.email || 
    ''
  ).trim().toLowerCase();

  const isDevUser = isDeveloperEmail(effectiveEmail);

  // O nick @Lanskyy é exclusivo da conta oficial de administrador
  if (clean === 'lanskyy' || clean === 'lansky') {
    if (isDevUser) {
      return { available: true };
    }
    return {
      available: false,
      error: 'O nick @Lanskyy é exclusivo da conta oficial de administrador.'
    };
  }

  try {
    const colRef = collection(db, 'user_profiles');
    const snapshot = await getDocs(query(colRef, limit(200)));
    let isTaken = false;

    snapshot.forEach((docSnap) => {
      if (isTaken) return;
      const data = docSnap.data() as UserProfile;
      const ownerId = data.userId || docSnap.id;

      // Se for o próprio usuário pelo UID, não conta como conflito
      if (ownerId === currentUserId) return;

      const docEmail = (data.email || '').trim().toLowerCase();

      // Se o documento no Firestore tiver o mesmo e-mail do usuário atual, é a mesma pessoa
      if (effectiveEmail && docEmail && docEmail === effectiveEmail) {
        return;
      }

      // Se o usuário for o desenvolvedor oficial e pertencer ao e-mail oficial
      if (isDevUser && isDeveloperEmail(docEmail)) {
        return;
      }

      const existingClean = normalizeUsername(data.publicUsername || '');
      if (existingClean === clean) {
        isTaken = true;
      }
    });

    if (isTaken) {
      return {
        available: false,
        error: `O Nick "@${clean}" já está em uso por outro usuário. Por favor, escolha outro.`
      };
    }

    return { available: true };
  } catch (error) {
    console.error('Erro ao verificar disponibilidade de nick:', error);
    return { available: true };
  }
};

/**
 * Obtém o perfil customizado do usuário com sanitização e resolução de conflitos
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) return null;

  // Sanitizador interno para garantir regras estritas
  const sanitizeProfile = (prof: UserProfile): { profile: UserProfile; wasModified: boolean } => {
    let wasModified = false;
    const cloned = { ...prof };
    const email = (cloned.email || '').trim().toLowerCase();
    const isDev = isDeveloperEmail(email);

    if (isDev) {
      if (!cloned.isDeveloperAdmin) {
        cloned.isDeveloperAdmin = true;
        wasModified = true;
      }
    } else {
      if (cloned.isDeveloperAdmin) {
        cloned.isDeveloperAdmin = false;
        wasModified = true;
      }
      const nick = normalizeUsername(cloned.publicUsername || '');
      if (nick === 'lanskyy' || nick === 'lansky') {
        cloned.publicUsername = email ? email.split('@')[0] : 'usuario';
        wasModified = true;
      }
    }
    return { profile: cloned, wasModified };
  };

  // Tentar carregar do localStorage primeiro para exibição ultra rápida
  const localCache = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`);
  let cachedProfile: UserProfile | null = null;
  if (localCache) {
    try {
      const parsed = JSON.parse(localCache);
      const { profile: sanitizedCache } = sanitizeProfile(parsed);
      cachedProfile = sanitizedCache;
    } catch (e) {
      console.warn('Erro ao ler cache local de perfil:', e);
    }
  }

  const path = `user_profiles/${userId}`;
  try {
    const docRef = doc(db, 'user_profiles', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      const merged: UserProfile = { ...data, userId };
      const { profile: sanitized, wasModified } = sanitizeProfile(merged);

      if (wasModified && auth.currentUser?.uid === userId) {
        try {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(docRef, sanitized, { merge: true });
        } catch (e) {
          console.warn('Aviso ao sincronizar ajuste de conta no Firestore:', e);
        }
      }

      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch (error: any) {
    const isOffline =
      error?.code === 'unavailable' ||
      (typeof error?.message === 'string' && (
        error.message.includes('offline') ||
        error.message.includes('unavailable') ||
        error.message.includes('Failed to get document')
      ));

    const isPermissionError =
      error?.code === 'permission-denied' ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('permission'));

    if (isPermissionError) {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Retornar cachedProfile se disponível
      }
    } else if (!isOffline) {
      console.warn('Aviso ao consultar perfil no Firestore:', error);
    }
  }

  return cachedProfile;
};

/**
 * Busca o perfil de um usuário pelo Nickname ou UserId como chave primária
 */
export const getUserProfileByUsername = async (username: string): Promise<UserProfile | null> => {
  if (!username) return null;
  const raw = username.trim();
  
  // 1. Tenta buscar diretamente pelo ID único do usuário primeiro (chave primária definitiva)
  try {
    const directProfile = await getUserProfile(raw);
    if (directProfile) return directProfile;
  } catch {
    // Continua para busca por nick
  }

  const clean = raw.toLowerCase().replace(/^@/, '');
  const slugWithoutPerfil = clean.startsWith('perfil') ? clean.replace(/^perfil[-_]?/, '') : clean;

  try {
    const colRef = collection(db, 'user_profiles');
    const snapshot = await getDocs(query(colRef, limit(150)));
    const matchingProfiles: UserProfile[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      const u = (data.publicUsername || '').trim().toLowerCase().replace(/^@/, '');
      const uid = (data.userId || docSnap.id).toLowerCase();

      // Comparações de tolerância (exato, sem @, sem prefixo perfil, ou apenas alfanumérico)
      if (
        uid === clean ||
        u === clean ||
        u === slugWithoutPerfil ||
        u.replace(/[^a-z0-9]/g, '') === clean.replace(/[^a-z0-9]/g, '') ||
        u.replace(/[^a-z0-9]/g, '') === slugWithoutPerfil.replace(/[^a-z0-9]/g, '')
      ) {
        matchingProfiles.push({ ...data, userId: data.userId || docSnap.id });
      }
    });

    if (matchingProfiles.length === 0) return null;

    // Desempate inteligente:
    // 1. Perfil do usuário atualmente autenticado
    // 2. Perfil de administrador mestre do sistema
    // 3. Perfil atualizado mais recentemente
    const currentUid = auth.currentUser?.uid;
    matchingProfiles.sort((a, b) => {
      if (currentUid && a.userId === currentUid) return -1;
      if (currentUid && b.userId === currentUid) return 1;

      const aIsDev = isDeveloperEmail(a.email);
      const bIsDev = isDeveloperEmail(b.email);
      if (aIsDev && !bIsDev) return -1;
      if (!aIsDev && bIsDev) return 1;

      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    return matchingProfiles[0];
  } catch (error) {
    console.error('Erro ao buscar perfil por username no Firestore:', error);
    return null;
  }
};

/**
 * Busca múltiplos perfis que correspondam ou contenham o termo pesquisado (para desambiguação de nicks parecidos)
 */
export const searchUserProfilesByQuery = async (queryText: string, currentUid?: string): Promise<UserProfile[]> => {
  if (!queryText || !queryText.trim()) return [];
  const raw = queryText.trim();
  const clean = raw.toLowerCase().replace(/^@/, '');
  const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');

  try {
    const colRef = collection(db, 'user_profiles');
    const snapshot = await getDocs(query(colRef, limit(150)));
    const matching: UserProfile[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      const uid = (data.userId || docSnap.id).toLowerCase();
      const u = (data.publicUsername || '').trim().toLowerCase().replace(/^@/, '');
      const uAlpha = u.replace(/[^a-z0-9]/g, '');
      const title = (data.honoraryTitle || '').toLowerCase();

      // Ignora perfis privados sem nickname
      if (data.isPublicList === false) return;
      if (!data.publicUsername) return;

      // Correspondência flexível por substring ou igualdade
      const isMatch =
        uid === clean ||
        u === clean ||
        u.includes(clean) ||
        (cleanAlpha.length >= 2 && uAlpha.includes(cleanAlpha)) ||
        title.includes(clean);

      if (isMatch) {
        matching.push({ ...data, userId: data.userId || docSnap.id });
      }
    });

    // Ordenação inteligente:
    // 1. Matches exatos primeiro
    // 2. Perfis que começam com a palavra pesquisada
    // 3. Atualizados recentemente
    matching.sort((a, b) => {
      const uA = (a.publicUsername || '').toLowerCase().replace(/^@/, '');
      const uB = (b.publicUsername || '').toLowerCase().replace(/^@/, '');

      const exactA = uA === clean;
      const exactB = uB === clean;
      if (exactA && !exactB) return -1;
      if (!exactA && exactB) return 1;

      const startsA = uA.startsWith(clean);
      const startsB = uB.startsWith(clean);
      if (startsA && !startsB) return -1;
      if (!startsA && startsB) return 1;

      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return matching.slice(0, 15);
  } catch (error) {
    console.error('Erro ao pesquisar perfis por query no Firestore:', error);
    return [];
  }
};

/**
 * Salva ou atualiza o perfil personalizado (avatar, banner, nickname, bio e privacidade)
 */
export const saveUserProfile = async (
  userId: string,
  profileData: Partial<UserProfile>
): Promise<UserProfile> => {
  const existing = await getUserProfile(userId);
  const userEmail = (profileData.email || auth.currentUser?.email || existing?.email || '').trim().toLowerCase();
  
  // Verificação estrita de privilégios administrativos
  const isDevAdmin = isDeveloperEmail(userEmail);

  // Sincroniza permissões no banco de dados se for administrador mestre
  if (isDevAdmin) {
    syncMasterAdminPrivilege(userId, userEmail).catch(() => {});
  }

  let nextUsernameLastChangedAt = existing?.usernameLastChangedAt;

  // Verifica se o Nickname está sendo alterado
  if (profileData.publicUsername !== undefined) {
    const newNickClean = normalizeUsername(profileData.publicUsername);
    const currentNickClean = normalizeUsername(existing?.publicUsername || '');

    // Se usuário não for o admin e tentar pegar o nick exclusivo @Lanskyy
    if (!isDevAdmin && (newNickClean === 'lanskyy' || newNickClean === 'lansky')) {
      throw new Error('O nick @Lanskyy é exclusivo da conta oficial de administrador.');
    }

    if (newNickClean && newNickClean !== currentNickClean) {
      // 1. Verificação de Cooldown de 30 dias (Ignorado para o desenvolvedor oficial)
      if (!isDevAdmin && existing?.usernameLastChangedAt) {
        const lastChangedTime = new Date(existing.usernameLastChangedAt).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const timeDiff = Date.now() - lastChangedTime;

        if (timeDiff < thirtyDaysMs) {
          const nextAllowedDate = new Date(lastChangedTime + thirtyDaysMs);
          const formattedDate = nextAllowedDate.toLocaleDateString('pt-BR');
          throw new Error(
            `O Nick só pode ser alterado uma vez a cada 30 dias. Próxima alteração liberada em: ${formattedDate}.`
          );
        }
      }

      // 2. Verificação de Nickname Único
      const isDevClaimingOfficialNick = isDevAdmin && (newNickClean === 'lanskyy' || newNickClean === 'lansky');
      if (!isDevClaimingOfficialNick) {
        const availability = await checkUsernameAvailability(newNickClean, userId, userEmail);
        if (!availability.available) {
          throw new Error(availability.error || 'Este Nick já está em uso por outro usuário.');
        }
      }

      nextUsernameLastChangedAt = new Date().toISOString();
    }
  }

  // Se não for dev admin e por algum motivo o nick for lanskyy, sanitiza para o identificador padrão
  let finalPublicUsername = profileData.publicUsername !== undefined ? profileData.publicUsername : (existing?.publicUsername || '');
  if (!isDevAdmin && (normalizeUsername(finalPublicUsername) === 'lanskyy' || normalizeUsername(finalPublicUsername) === 'lansky')) {
    finalPublicUsername = userEmail ? userEmail.split('@')[0] : 'usuario';
  }

  const updated: UserProfile = {
    userId,
    customAvatarUrl: profileData.customAvatarUrl !== undefined ? profileData.customAvatarUrl : (existing?.customAvatarUrl || ''),
    customBannerUrl: profileData.customBannerUrl !== undefined ? profileData.customBannerUrl : (existing?.customBannerUrl || ''),
    isPublicList: profileData.isPublicList !== undefined ? profileData.isPublicList : (existing?.isPublicList ?? true),
    publicUsername: finalPublicUsername,
    publicBio: profileData.publicBio !== undefined ? profileData.publicBio : (existing?.publicBio || ''),
    honoraryTitle: profileData.honoraryTitle !== undefined ? profileData.honoraryTitle : (existing?.honoraryTitle || ''),
    email: userEmail || '',
    isDeveloperAdmin: isDevAdmin,
    usernameLastChangedAt: nextUsernameLastChangedAt || '',
    featuredBadges: profileData.featuredBadges !== undefined ? profileData.featuredBadges : (existing?.featuredBadges || []),
    favoriteAnimeIds: profileData.favoriteAnimeIds !== undefined ? profileData.favoriteAnimeIds : (existing?.favoriteAnimeIds || []),
    following: profileData.following !== undefined ? profileData.following : (existing?.following || []),
    updatedAt: new Date().toISOString(),
    cardTheme: profileData.cardTheme !== undefined ? profileData.cardTheme : (existing?.cardTheme || 'cyberpunk'),
    archetype: profileData.archetype !== undefined ? profileData.archetype : (existing?.archetype || 'noble_heart'),
    honorPillars: profileData.honorPillars !== undefined ? profileData.honorPillars : (existing?.honorPillars || []),
    quote: profileData.quote !== undefined ? profileData.quote : (existing?.quote || ''),
  };

  // Garante que imagens em base64 sejam comprimidas antes de salvar no Firestore
  // O Firestore tem um limite estrito de 1.048.576 bytes (1MB) por documento.
  if (updated.customAvatarUrl && (updated.customAvatarUrl.startsWith('data:') || updated.customAvatarUrl.length > 50_000)) {
    try {
      updated.customAvatarUrl = await compressBase64Image(updated.customAvatarUrl, 256, 256, 0.75, 80_000);
    } catch (e) {
      console.warn('Erro ao comprimir avatar:', e);
    }
  }

  if (updated.customBannerUrl && (updated.customBannerUrl.startsWith('data:') || updated.customBannerUrl.length > 100_000)) {
    try {
      updated.customBannerUrl = await compressBase64Image(updated.customBannerUrl, 900, 450, 0.75, 200_000);
    } catch (e) {
      console.warn('Erro ao comprimir capa/banner:', e);
    }
  }

  // Salva no cache local imediatamente com as imagens já otimizadas
  localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(updated));

  // Sanitiza payload para o Firestore (evita erros com valores undefined)
  const firestorePayload: Record<string, any> = {
    userId,
    customAvatarUrl: updated.customAvatarUrl || '',
    customBannerUrl: updated.customBannerUrl || '',
    isPublicList: updated.isPublicList ?? true,
    publicUsername: updated.publicUsername || '',
    publicBio: updated.publicBio || '',
    honoraryTitle: updated.honoraryTitle || '',
    isDeveloperAdmin: isDevAdmin,
    featuredBadges: updated.featuredBadges || [],
    favoriteAnimeIds: updated.favoriteAnimeIds || [],
    following: updated.following || [],
    updatedAt: updated.updatedAt,
    cardTheme: updated.cardTheme || 'cyberpunk',
    archetype: updated.archetype || 'noble_heart',
    honorPillars: updated.honorPillars || [],
    quote: updated.quote || '',
  };

  if (updated.email) {
    firestorePayload.email = updated.email;
  }
  if (updated.usernameLastChangedAt) {
    firestorePayload.usernameLastChangedAt = updated.usernameLastChangedAt;
  }

  // Verificação de segurança de tamanho do documento (limite do Firestore = 1MB)
  let payloadStr = JSON.stringify(firestorePayload);
  if (payloadStr.length > 700_000) {
    console.warn(`Tamanho de payload elevado (${payloadStr.length} bytes), aplicando compressão intensiva...`);
    if (firestorePayload.customBannerUrl?.startsWith('data:image/')) {
      firestorePayload.customBannerUrl = await compressBase64Image(firestorePayload.customBannerUrl, 640, 320, 0.55, 120_000);
      updated.customBannerUrl = firestorePayload.customBannerUrl;
    }
    if (firestorePayload.customAvatarUrl?.startsWith('data:image/')) {
      firestorePayload.customAvatarUrl = await compressBase64Image(firestorePayload.customAvatarUrl, 180, 180, 0.55, 40_000);
      updated.customAvatarUrl = firestorePayload.customAvatarUrl;
    }
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(updated));
  }

  const path = `user_profiles/${userId}`;
  try {
    const docRef = doc(db, 'user_profiles', userId);
    await setDoc(docRef, firestorePayload, { merge: true });
  } catch (error) {
    console.error('Erro ao persistir perfil no Firestore:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  return updated;
};

/**
 * Retorna lista de IDs ou Nicks de usuários seguidos
 */
export const getFollowedUsers = (userId: string): string[] => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_FOLLOWING_KEY_PREFIX}${userId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Erro ao ler seguidos:', e);
  }
  return [];
};

/**
 * Segue um usuário
 */
export const followUser = async (currentUserId: string, targetUserIdOrNick: string): Promise<string[]> => {
  if (!currentUserId || !targetUserIdOrNick) return [];
  const cleanTarget = targetUserIdOrNick.trim().toLowerCase().replace(/^@/, '');
  const current = getFollowedUsers(currentUserId);
  if (!current.includes(cleanTarget)) {
    const updated = [...current, cleanTarget];
    localStorage.setItem(`${LOCAL_FOLLOWING_KEY_PREFIX}${currentUserId}`, JSON.stringify(updated));
    // Persiste no perfil
    try {
      await saveUserProfile(currentUserId, { following: updated });
    } catch (e) {
      console.warn('Erro ao persistir follow no Firestore:', e);
    }
    return updated;
  }
  return current;
};

/**
 * Deixa de seguir um usuário
 */
export const unfollowUser = async (currentUserId: string, targetUserIdOrNick: string): Promise<string[]> => {
  if (!currentUserId || !targetUserIdOrNick) return [];
  const cleanTarget = targetUserIdOrNick.trim().toLowerCase().replace(/^@/, '');
  const current = getFollowedUsers(currentUserId);
  const updated = current.filter((id) => id !== cleanTarget);
  localStorage.setItem(`${LOCAL_FOLLOWING_KEY_PREFIX}${currentUserId}`, JSON.stringify(updated));
  try {
    await saveUserProfile(currentUserId, { following: updated });
  } catch (e) {
    console.warn('Erro ao persistir unfollow no Firestore:', e);
  }
  return updated;
};

/**
 * Perfis em destaque da comunidade para descobrir e seguir
 * Exibe apenas usuários reais cadastrados no sistema (limitado de 5 a 10)
 */
export const getCommunityPopularProfiles = async (currentUid?: string): Promise<UserProfile[]> => {
  try {
    if (db) {
      const colRef = collection(db, 'user_profiles');
      // Busca perfis públicos reais cadastrados no Firestore
      const snapshot = await getDocs(query(colRef, limit(20)));
      if (!snapshot.empty) {
        const liveProfiles: UserProfile[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as UserProfile;
          const uid = data.userId || d.id;
          // Ignora usuário logado para mostrar outros membros
          if (currentUid && uid === currentUid) return;
          if (data.isPublicList !== false && data.publicUsername) {
            liveProfiles.push({ ...data, userId: uid });
          }
        });

        // Ordena por atividade mais recente ou maior número de animes/seguidores
        liveProfiles.sort((a, b) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        });

        // Retorna no máximo 10 perfis reais
        return liveProfiles.slice(0, 10);
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar perfis reais da comunidade do Firestore:', e);
  }

  return [];
};

/**
 * Busca os perfis completos das pessoas que o usuário segue
 */
export const getFollowedUserProfiles = async (followingIdentifiers: string[]): Promise<UserProfile[]> => {
  if (!followingIdentifiers || followingIdentifiers.length === 0) return [];
  const results: UserProfile[] = [];

  for (const identifier of followingIdentifiers) {
    if (!identifier) continue;
    try {
      let prof = await getUserProfile(identifier);
      if (!prof) {
        prof = await getUserProfileByUsername(identifier);
      }
      if (prof && !results.some((r) => r.userId === prof?.userId || r.publicUsername === prof?.publicUsername)) {
        results.push(prof);
      }
    } catch (e) {
      console.warn(`Erro ao carregar perfil seguido [${identifier}]:`, e);
    }
  }

  return results;
};

/**
 * Busca os perfis que seguem o usuário especificado (Seguidores)
 */
export const getFollowerProfiles = async (targetUserId: string, targetUsername?: string): Promise<UserProfile[]> => {
  if (!targetUserId && !targetUsername) return [];
  const results: UserProfile[] = [];
  const cleanNick = (targetUsername || '').trim().toLowerCase().replace(/^@/, '');
  const cleanUid = (targetUserId || '').trim().toLowerCase();

  try {
    if (db) {
      const colRef = collection(db, 'user_profiles');
      const snapshot = await getDocs(query(colRef, limit(50)));
      if (!snapshot.empty) {
        snapshot.forEach((d) => {
          const data = d.data() as UserProfile;
          const uid = data.userId || d.id;
          if (uid === targetUserId) return; // Não conta a si mesmo

          const followingList = Array.isArray(data.following)
            ? data.following.map((item) => String(item).trim().toLowerCase().replace(/^@/, ''))
            : [];

          const isFollowingMe =
            (cleanUid && followingList.includes(cleanUid)) ||
            (cleanNick && followingList.includes(cleanNick));

          if (isFollowingMe) {
            results.push({ ...data, userId: uid });
          }
        });
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar seguidores no Firestore:', e);
  }

  return results;
};

/**
 * Remove permanentemente o perfil do usuário do Firestore e limpa o cache local
 */
export const deleteUserProfile = async (userId: string): Promise<void> => {
  localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`);
  const path = `user_profiles/${userId}`;
  try {
    const docRef = doc(db, 'user_profiles', userId);
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Erro ao excluir perfil do Firestore:', error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

