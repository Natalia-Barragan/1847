'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { ProductRow } from '@/types/database.types'

export interface CreateProductInput {
  categoryId: string
  name: string
  price: number
  detail?: string
  vatRate?: number
  isActive?: boolean
}

export interface UpdateProductInput {
  categoryId?: string
  name?: string
  price?: number
  detail?: string
  vatRate?: number
  isActive?: boolean
}

const isMock = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')

/**
 * 1. Crear un nuevo producto en el menú.
 */
export async function createProductAction(data: CreateProductInput): Promise<{
  success: boolean
  product?: ProductRow
  error?: string
}> {
  try {
    if (!data.name || data.name.trim() === '') {
      return { success: false, error: 'El nombre del producto es obligatorio.' }
    }
    if (data.price < 0) {
      return { success: false, error: 'El precio no puede ser negativo.' }
    }

    if (isMock) {
      const mockProduct: ProductRow = {
        id: `p-${Date.now()}`,
        category_id: data.categoryId,
        name: data.name.trim(),
        price: data.price,
        detail: data.detail || null,
        vat_rate: data.vatRate || 21.0,
        is_active: data.isActive ?? true,
        created_at: new Date().toISOString(),
      }
      return { success: true, product: mockProduct }
    }

    const { data: newProd, error } = await supabaseAdmin
      .from('products')
      .insert({
        category_id: data.categoryId,
        name: data.name.trim(),
        price: data.price,
        detail: data.detail || null,
        vat_rate: data.vatRate || 21.0,
        is_active: data.isActive ?? true,
      })
      .select()
      .single()

    if (error || !newProd) {
      return { success: false, error: `Error al crear producto: ${error?.message}` }
    }

    return { success: true, product: newProd }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al crear producto.' }
  }
}

/**
 * 2. Actualizar un producto existente (precio, nombre, categoría, detalle).
 */
export async function updateProductAction(
  productId: string,
  data: UpdateProductInput
): Promise<{
  success: boolean
  product?: ProductRow
  error?: string
}> {
  try {
    if (data.price !== undefined && data.price < 0) {
      return { success: false, error: 'El precio no puede ser negativo.' }
    }

    if (isMock) {
      const mockUpdated: ProductRow = {
        id: productId,
        category_id: data.categoryId || 'c1000000-0000-0000-0000-000000000001',
        name: data.name || 'Producto Actualizado',
        price: data.price ?? 1000,
        detail: data.detail || null,
        vat_rate: data.vatRate || 21.0,
        is_active: data.isActive ?? true,
        created_at: new Date().toISOString(),
      }
      return { success: true, product: mockUpdated }
    }

    const updatePayload: Record<string, any> = {}
    if (data.categoryId !== undefined) updatePayload.category_id = data.categoryId
    if (data.name !== undefined) updatePayload.name = data.name.trim()
    if (data.price !== undefined) updatePayload.price = data.price
    if (data.detail !== undefined) updatePayload.detail = data.detail
    if (data.vatRate !== undefined) updatePayload.vat_rate = data.vatRate
    if (data.isActive !== undefined) updatePayload.is_active = data.isActive

    const { data: updatedProd, error } = await supabaseAdmin
      .from('products')
      .update(updatePayload as any)
      .eq('id', productId)
      .select()
      .single()

    if (error || !updatedProd) {
      return { success: false, error: `Error al actualizar producto: ${error?.message}` }
    }

    return { success: true, product: updatedProd }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al actualizar producto.' }
  }
}

/**
 * 3. Alternar la disponibilidad de un producto ("Disponible" vs "Agotado").
 */
export async function toggleProductAvailabilityAction(
  productId: string,
  isActive: boolean
): Promise<{
  success: boolean
  isActive?: boolean
  error?: string
}> {
  try {
    if (isMock) {
      return { success: true, isActive }
    }

    const { data: updatedProd, error } = await supabaseAdmin
      .from('products')
      .update({ is_active: isActive })
      .eq('id', productId)
      .select('is_active')
      .single()

    if (error || !updatedProd) {
      return { success: false, error: `Error al modificar disponibilidad: ${error?.message}` }
    }

    return { success: true, isActive: updatedProd.is_active }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al modificar disponibilidad.' }
  }
}
