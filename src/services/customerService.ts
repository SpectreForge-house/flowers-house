import { v4 as uuidv4 } from 'uuid';
import { Customer, Order } from '../types';
import { getCustomers, saveCustomers, getOrders } from './storage';

export function createCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
  const customer: Customer = {
    ...data,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  addCustomer(customer);
  return customer;
}

export function addCustomer(customer: Customer): void {
  const customers = getCustomers();
  customers.push(customer);
  saveCustomers(customers);
}

export function updateCustomer(updated: Customer): void {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === updated.id);
  if (index !== -1) {
    customers[index] = { ...updated, updatedAt: new Date().toISOString() };
    saveCustomers(customers);
  }
}

export function deleteCustomer(id: string): void {
  const customers = getCustomers().filter(c => c.id !== id);
  saveCustomers(customers);
}

export function getCustomerById(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

export function getCustomerOrders(customerId: string, ordersOverride?: Order[]) {
  return (ordersOverride ?? getOrders()).filter(o => o.customerId === customerId);
}

export function getCustomerStats(customerId: string, ordersOverride?: Order[]) {
  const orders = getCustomerOrders(customerId, ordersOverride);
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalSpent = completedOrders.reduce((sum, o) => sum + o.total, 0);
  
  return {
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    totalSpent,
    lastOrder: orders.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0],
  };
}

export function searchCustomers(query: string): Customer[] {
  const customers = getCustomers();
  const lowerQuery = query.toLowerCase();
  
  return customers.filter(c => 
    c.name.toLowerCase().includes(lowerQuery) ||
    c.phone.includes(query) ||
    (c.email && c.email.toLowerCase().includes(lowerQuery))
  );
}
