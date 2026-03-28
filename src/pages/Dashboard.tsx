import React, { useEffect, useState } from 'react';
import { Users, Package, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';
import api from '../lib/api';
import { PaginatedResponse, User, Product } from '../types';
import { motion } from 'motion/react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalProducts: 0,
    totalOrders: 124, // Placeholder
    revenue: 15230, // Placeholder
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersRes, productsRes] = await Promise.all([
          api.get<any>('/users/all?limit=1'),
          api.get<any>('/admin/products?limit=1'),
        ]);

        console.log('Dashboard stats fetch raw:', { users: usersRes.data, products: productsRes.data });
        
        const findCount = (obj: any): number | null => {
          if (typeof obj === 'number') return obj;
          if (!obj || typeof obj !== 'object') return null;
          
          // Check common keys first
          const countKeys = ['totalCount', 'total', 'count', 'totalResults', 'length'];
          for (const key of countKeys) {
            if (typeof obj[key] === 'number') return obj[key];
          }
          
          // Check if it's an array directly
          if (Array.isArray(obj)) return obj.length;
          
          // Check for arrays in common keys
          const arrayKeys = ['data', 'users', 'products', 'results', 'items'];
          for (const key of arrayKeys) {
            if (Array.isArray(obj[key])) return obj[key].length;
          }

          // Recursive search for any number that looks like a count
          for (const key in obj) {
            // Skip success/status flags
            if (key === 'success' || key === 'status') continue;
            const result = findCount(obj[key]);
            if (result !== null) return result;
          }
          return null;
        };

        const userCount = findCount(usersRes.data) ?? 0;
        const productCount = findCount(productsRes.data) ?? 0;

        setStats(prev => ({
          ...prev,
          totalCustomers: userCount,
          totalProducts: productCount,
        }));
      } catch (error) {
        console.error('Error fetching stats', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
    // Refresh stats every 30 seconds to keep it updated
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { name: 'Total Customers', value: stats.totalCustomers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Total Products', value: stats.totalProducts, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { name: 'Total Orders', value: stats.totalOrders, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50' },
    { name: 'Revenue', value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card flex items-center gap-4"
          >
            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.name}</p>
              <h3 className="text-2xl font-bold text-gray-900">
                {isLoading ? '...' : stat.value}
              </h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Recent Activity</h3>
            <TrendingUp className="text-gray-400" size={20} />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <Users size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New user registered</p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">User</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 border border-gray-200 rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group">
              <Package className="text-gray-400 group-hover:text-accent mb-2" size={24} />
              <p className="font-medium">Add Product</p>
              <p className="text-xs text-gray-500">Create a new listing</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group">
              <Users className="text-gray-400 group-hover:text-accent mb-2" size={24} />
              <p className="font-medium">View Users</p>
              <p className="text-xs text-gray-500">Manage customers</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
