export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tables: {
        Row: {
          id: string
          number: string
          status: 'libre' | 'ocupada' | 'cuenta'
          capacity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          number: string
          status?: 'libre' | 'ocupada' | 'cuenta'
          capacity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          number?: string
          status?: 'libre' | 'ocupada' | 'cuenta'
          capacity?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          icon: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          icon?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          icon?: string | null
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          category_id: string | null
          name: string
          price: number
          detail: string | null
          vat_rate: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          category_id?: string | null
          name: string
          price: number
          detail?: string | null
          vat_rate?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string | null
          name?: string
          price?: number
          detail?: string | null
          vat_rate?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: string
          table_id: string | null
          origin: 'salon' | 'takeaway' | 'qr'
          customer_name: string | null
          customer_phone: string | null
          estimated_time: string | null
          notes: string | null
          status: 'open' | 'closed' | 'cancelled'
          kds_status: 'pending' | 'preparing' | 'ready' | 'delivered'
          subtotal: number
          discount_pct: number
          discount_amount: number
          payment_method: 'efectivo' | 'debito' | 'credito' | 'qr' | null
          total: number
          closed_at: string | null
          user_id?: string | null
          user_name?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          last_prebill_at?: string | null
          last_prebill_by_user_id?: string | null
          last_prebill_by_user_name?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          table_id?: string | null
          origin: 'salon' | 'takeaway' | 'qr'
          customer_name?: string | null
          customer_phone?: string | null
          estimated_time?: string | null
          notes?: string | null
          status?: 'open' | 'closed' | 'cancelled'
          kds_status?: 'pending' | 'preparing' | 'ready' | 'delivered'
          subtotal?: number
          discount_pct?: number
          discount_amount?: number
          payment_method?: 'efectivo' | 'debito' | 'credito' | 'qr' | null
          total?: number
          closed_at?: string | null
          user_id?: string | null
          user_name?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          last_prebill_at?: string | null
          last_prebill_by_user_id?: string | null
          last_prebill_by_user_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          table_id?: string | null
          origin?: 'salon' | 'takeaway' | 'qr'
          customer_name?: string | null
          customer_phone?: string | null
          estimated_time?: string | null
          notes?: string | null
          status?: 'open' | 'closed' | 'cancelled'
          kds_status?: 'pending' | 'preparing' | 'ready' | 'delivered'
          subtotal?: number
          discount_pct?: number
          discount_amount?: number
          payment_method?: 'efectivo' | 'debito' | 'credito' | 'qr' | null
          total?: number
          closed_at?: string | null
          user_id?: string | null
          user_name?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          last_prebill_at?: string | null
          last_prebill_by_user_id?: string | null
          last_prebill_by_user_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            referencedRelation: "tables"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          unit_price: number
          notes: string | null
          status?: 'active' | 'cancelled'
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cancelled_by_user_name?: string | null
          cancel_reason?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          unit_price: number
          notes?: string | null
          status?: 'active' | 'cancelled'
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cancelled_by_user_name?: string | null
          cancel_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
          notes?: string | null
          status?: 'active' | 'cancelled'
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cancelled_by_user_name?: string | null
          cancel_reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices_arca: {
        Row: {
          id: string
          order_id: string
          invoice_number: string
          cae: string | null
          cae_due_date: string | null
          invoice_type: 'A' | 'B' | 'C'
          doc_type: number
          doc_number: string
          net_amount: number
          vat_rate: number
          vat_amount: number
          exempt_amount: number
          total_amount: number
          status: 'pending' | 'approved' | 'rejected'
          arca_response: Json | null
          user_id: string | null
          user_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          invoice_number: string
          cae?: string | null
          cae_due_date?: string | null
          invoice_type: 'A' | 'B' | 'C'
          doc_type?: number
          doc_number?: string
          net_amount: number
          vat_rate?: number
          vat_amount: number
          exempt_amount?: number
          total_amount: number
          status?: 'pending' | 'approved' | 'rejected'
          arca_response?: Json | null
          user_id?: string | null
          user_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          invoice_number?: string
          cae?: string | null
          cae_due_date?: string | null
          invoice_type?: 'A' | 'B' | 'C'
          doc_type?: number
          doc_number?: string
          net_amount?: number
          vat_rate?: number
          vat_amount?: number
          exempt_amount?: number
          total_amount?: number
          status?: 'pending' | 'approved' | 'rejected'
          arca_response?: Json | null
          user_id?: string | null
          user_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_arca_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      cash_register_shifts: {
        Row: {
          id: string
          shift_name: string
          status: 'open' | 'closed'
          opened_at: string
          opened_by_user_id: string
          opened_by_user_name: string
          initial_cash: number
          closed_at: string | null
          closed_by_user_id: string | null
          closed_by_user_name: string | null
          final_cash_expected: number | null
          final_cash_real: number | null
          cash_difference: number | null
          total_orders_count: number | null
          total_sales_amount: number | null
          total_cash_amount: number | null
          total_debit_amount: number | null
          total_credit_amount: number | null
          total_qr_amount: number | null
          total_fiscal_net: number | null
          total_fiscal_vat: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          shift_name: string
          status?: 'open' | 'closed'
          opened_at?: string
          opened_by_user_id: string
          opened_by_user_name: string
          initial_cash?: number
          closed_at?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          final_cash_expected?: number | null
          final_cash_real?: number | null
          cash_difference?: number | null
          total_orders_count?: number | null
          total_sales_amount?: number | null
          total_cash_amount?: number | null
          total_debit_amount?: number | null
          total_credit_amount?: number | null
          total_qr_amount?: number | null
          total_fiscal_net?: number | null
          total_fiscal_vat?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          shift_name?: string
          status?: 'open' | 'closed'
          opened_at?: string
          opened_by_user_id?: string
          opened_by_user_name?: string
          initial_cash?: number
          closed_at?: string | null
          closed_by_user_id?: string | null
          closed_by_user_name?: string | null
          final_cash_expected?: number | null
          final_cash_real?: number | null
          cash_difference?: number | null
          total_orders_count?: number | null
          total_sales_amount?: number | null
          total_cash_amount?: number | null
          total_debit_amount?: number | null
          total_credit_amount?: number | null
          total_qr_amount?: number | null
          total_fiscal_net?: number | null
          total_fiscal_vat?: number | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      order_item_cancellations: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          reason: string
          user_id: string
          user_name: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          order_item_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
          reason: string
          user_id: string
          user_name: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          order_item_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          reason?: string
          user_id?: string
          user_name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_cancellations_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_cancellations_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          }
        ]
      }
      prebill_emissions: {
        Row: {
          id: string
          order_id: string
          table_id: string | null
          table_number: string | null
          subtotal: number
          discount_pct: number
          discount_amount: number
          total: number
          user_id: string
          user_name: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          table_id?: string | null
          table_number?: string | null
          subtotal: number
          discount_pct?: number
          discount_amount?: number
          total: number
          user_id: string
          user_name: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          table_id?: string | null
          table_number?: string | null
          subtotal?: number
          discount_pct?: number
          discount_amount?: number
          total?: number
          user_id?: string
          user_name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prebill_emissions_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string
          action: string
          entity: string
          entity_id: string | null
          user_id: string
          user_name: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          action: string
          entity: string
          entity_id?: string | null
          user_id: string
          user_name: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          entity?: string
          entity_id?: string | null
          user_id?: string
          user_name?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      inventory_stock: {
        Row: {
          id: string
          product_id: string | null
          name: string
          current_quantity: number
          unit: string
          min_stock: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          name: string
          current_quantity?: number
          unit: string
          min_stock?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          name?: string
          current_quantity?: number
          unit?: string
          min_stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_purchases: {
        Row: {
          id: string
          inventory_item_id: string
          quantity: number
          unit_price: number
          total_price: number
          supplier: string | null
          purchase_date: string
          created_at: string
        }
        Insert: {
          id?: string
          inventory_item_id: string
          quantity: number
          unit_price: number
          total_price: number
          supplier?: string | null
          purchase_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          inventory_item_id?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          supplier?: string | null
          purchase_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchases_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            referencedRelation: "inventory_stock"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Entidades de conveniencia mapeadas directamente
export type TableRow = Database['public']['Tables']['tables']['Row']
export type CategoryRow = Database['public']['Tables']['categories']['Row']
export type ProductRow = Database['public']['Tables']['products']['Row']
export type OrderRow = Database['public']['Tables']['orders']['Row']
export type OrderItemRow = Database['public']['Tables']['order_items']['Row']
export type InvoiceArcaRow = Database['public']['Tables']['invoices_arca']['Row']
export type CashRegisterShiftRow = Database['public']['Tables']['cash_register_shifts']['Row']
export type OrderItemCancellationRow = Database['public']['Tables']['order_item_cancellations']['Row']
export type PrebillEmissionRow = Database['public']['Tables']['prebill_emissions']['Row']
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row']
export type InventoryStockRow = Database['public']['Tables']['inventory_stock']['Row']
export type StockPurchaseRow = Database['public']['Tables']['stock_purchases']['Row']
