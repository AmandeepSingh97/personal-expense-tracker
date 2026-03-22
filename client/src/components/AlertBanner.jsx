import React from 'react';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';
import { dismissAlert, dismissAllAlerts } from '../api';
import toast from 'react-hot-toast';

export default function AlertBanner({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  const handleDismiss = async (id) => {
    await dismissAlert(id);
    onDismiss(id);
  };

  const handleDismissAll = async () => {
    await dismissAllAlerts();
    onDismiss('all');
  };

  return (
    <div className="space-y-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
            alert.type === 'exceeded'
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300'
          }`}
        >
          {alert.type === 'exceeded' ? (
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{alert.message}</span>
          <button onClick={() => handleDismiss(alert.id)} className="flex-shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      ))}
      {alerts.length > 1 && (
        <button
          onClick={handleDismissAll}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}
