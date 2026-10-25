export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';

export type UserRole = 'owner' | 'manager' | 'staff';

export type InviteRole = 'manager' | 'staff';

export interface UserProfile {
  id: string;
  shopId: string;
  displayName: string | null;
  role: UserRole;
  language: string;
  createdAt: string;
}

export interface ShopMember {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  isSelf: boolean;
}

export interface ShopInvite {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

export type Unit = 'pieces' | 'stems' | 'rolls' | 'bunches' | 'sheets' | 'meters';

export type ImportantDateType = 'birthday' | 'name_day' | 'anniversary' | 'other';

export interface ImportantDate {
  id: string;
  type: ImportantDateType;
  /** Full date as picked (YYYY-MM-DD). Recurrence uses day+month only; the year is optional. */
  date: string;
  /** When true the year is unknown - stored just to keep the picker happy. */
  noYear?: boolean;
  /** Optional free-text label, e.g. "Mom's birthday". */
  label?: string;
}

export type ClientStatus = 'new' | 'regular' | 'vip';

/** Thresholds + optional discounts for the automatic client status. */
export interface ClientStatusSettings {
  /** A client becomes "Regular" at this many purchases. */
  regularMinCount: number;
  /** A client becomes "VIP" at this total spent (€). */
  vipMinTotal: number;
  /** ...or at this many purchases. */
  vipMinCount: number;
  /** Suggested discount % per status (hint only, never touches prices). */
  discountNew: number;
  discountRegular: number;
  discountVip: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  notes?: string;
  preferences?: string;
  /** Yearly-recurring dates (birthday, name day, ...). Optional - older records have none. */
  importantDates?: ImportantDate[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  color?: string;
  quantity: number;
  minStock: number;
  purchasePrice: number;
  sellingPrice?: number;
  unit: Unit;
  capacity?: number;
  capacityUnit?: 'L' | 'ml';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  type: 'add' | 'remove' | 'waste';
  quantity: number;
  reason: string;
  referenceId?: string;
  createdAt: string;
  comment?: string;
}

export interface BouquetItem {
  inventoryItemId: string;
  quantity: number;
}

export interface Bouquet {
  id: string;
  name: string;
  description?: string;
  sellingPrice: number;
  items: BouquetItem[];
  photoUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  bouquetId: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryTime: string;
  items: OrderItem[];
  deliveryFee: number;
  total: number;
  comment?: string;
  status: OrderStatus;
  inventoryDeducted: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A manually added bouquet purchase (e.g. bouquets bought before the shop
 * started tracking orders). Never created from an order - the two sources
 * stay separate so nothing is double counted. Photos are stored via the
 * photo storage under `purchase:<id>`; the record only references files.
 */
export interface ClientPurchase {
  id: string;
  customerId: string;
  name?: string;
  composition: string;
  price: number;
  /** Purchase date, 'YYYY-MM-DD' (editable so old purchases can be added). */
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  address: string;
  customerName: string;
  recipientName: string;
  phone: string;
  scheduledTime: string;
  scheduledDate: string;
  status: 'waiting' | 'ready' | 'out_for_delivery' | 'delivered';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  currency: string;
  currencySymbol: string;
  defaultDeliveryFee: number;
  openingTime: string;
  closingTime: string;
  weekendOpeningTime: string;
  weekendClosingTime: string;
  /** Home page "Upcoming client dates" window in days. Optional - defaults to 14. */
  clientDatesWindowDays?: number;
  /** Client status (New/Regular/VIP) thresholds + discounts. Optional - defaults applied. */
  clientStatus?: ClientStatusSettings;
}

export type HistoryActionType =
  | 'order_created' | 'order_edited' | 'order_status_changed' | 'order_cancelled' | 'order_deleted'
  | 'delivery_time_changed'
  | 'reservation_created' | 'reservation_changed' | 'reservation_released' | 'reservation_completed'
  | 'inventory_received' | 'inventory_decreased' | 'inventory_waste'
  | 'bouquet_created' | 'bouquet_edited' | 'bouquet_deleted'
  | 'customer_created' | 'customer_edited' | 'customer_deleted'
  | 'settings_changed'
  | 'backup_created' | 'backup_restored';

export type EntityType = 'order' | 'delivery' | 'inventory' | 'bouquet' | 'customer' | 'reservation' | 'settings' | 'backup';

export interface HistoryRecord {
  id: string;
  timestamp: string;
  actionType: HistoryActionType;
  entityType: EntityType;
  entityId: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface InventoryReservation {
  id: string;
  orderId: string;
  inventoryItemId: string;
  quantity: number;
  status: 'active' | 'completed' | 'released';
  note?: string;
  createdAt: string;
  updatedAt: string;
}
