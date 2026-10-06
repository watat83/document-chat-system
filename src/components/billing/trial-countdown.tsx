'use client';

import { useMounted } from '@/hooks/use-mounted';
import { useState, useEffect } from 'react';
import { Clock, Calendar, Zap } from 'lucide-react';

interface TrialCountdownProps {
  trialEnd: string;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  className?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function TrialCountdown({
  trialEnd,
  size = 'medium',
  showIcon = true,
  className = ''
}: TrialCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);
  const mounted = useMounted();



  useEffect(() => {
    const calculateTimeRemaining = () => {
      const endDate = new Date(trialEnd);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          totalMs: 0
        });
        return;
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        totalMs: diffMs
      });
    };

    // Calculate immediately
    calculateTimeRemaining();

    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [trialEnd]);

  // Don't render anything until mounted to avoid hydration issues
  if (!mounted || !timeRemaining) {
    return null;
  }

  const { days, hours, minutes, seconds, totalMs } = timeRemaining;

  // Different sizes and styles
  const sizeClasses = {
    small: {
      container: 'text-sm',
      number: 'text-lg font-bold',
      label: 'text-xs',
      icon: 'h-4 w-4'
    },
    medium: {
      container: 'text-base',
      number: 'text-xl font-bold',
      label: 'text-sm',
      icon: 'h-5 w-5'
    },
    large: {
      container: 'text-lg',
      number: 'text-3xl font-bold',
      label: 'text-base',
      icon: 'h-6 w-6'
    }
  };

  const styles = sizeClasses[size];

  // Color based on time remaining
  const getUrgencyColor = () => {
    const daysRemaining = totalMs / (1000 * 60 * 60 * 24);

    if (daysRemaining <= 1) {
      return 'text-red-600 bg-red-50 border-red-200';
    } else if (daysRemaining <= 3) {
      return 'text-orange-600 bg-orange-50 border-orange-200';
    } else if (daysRemaining <= 7) {
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    } else {
      return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  // Trial expired
  if (totalMs <= 0) {
    return (
      <div className={`flex items-center space-x-2 ${styles.container} ${className}`}>
        {showIcon && <Clock className={`${styles.icon} text-red-500`} />}
        <span className="text-red-600 font-semibold">Trial Expired</span>
      </div>
    );
  }

  // Show different formats based on time remaining
  const formatTime = () => {
    if (days > 0) {
      // Show days and hours for longer periods
      return (
        <div className="flex items-center space-x-4">
          <div className="text-center">
            <div className={styles.number}>{days}</div>
            <div className={`${styles.label} text-gray-600`}>
              {days === 1 ? 'Day' : 'Days'}
            </div>
          </div>
          <div className="text-gray-400">:</div>
          <div className="text-center">
            <div className={styles.number}>{hours.toString().padStart(2, '0')}</div>
            <div className={`${styles.label} text-gray-600`}>
              {hours === 1 ? 'Hour' : 'Hours'}
            </div>
          </div>
        </div>
      );
    } else if (hours > 0) {
      // Show hours and minutes for final day
      return (
        <div className="flex items-center space-x-3">
          <div className="text-center">
            <div className={styles.number}>{hours}</div>
            <div className={`${styles.label} text-gray-600`}>
              {hours === 1 ? 'Hour' : 'Hours'}
            </div>
          </div>
          <div className="text-gray-400">:</div>
          <div className="text-center">
            <div className={styles.number}>{minutes.toString().padStart(2, '0')}</div>
            <div className={`${styles.label} text-gray-600`}>
              {minutes === 1 ? 'Min' : 'Mins'}
            </div>
          </div>
        </div>
      );
    } else {
      // Show minutes and seconds for final hour
      return (
        <div className="flex items-center space-x-3">
          <div className="text-center">
            <div className={styles.number}>{minutes}</div>
            <div className={`${styles.label} text-gray-600`}>
              {minutes === 1 ? 'Min' : 'Mins'}
            </div>
          </div>
          <div className="text-gray-400">:</div>
          <div className="text-center">
            <div className={styles.number}>{seconds.toString().padStart(2, '0')}</div>
            <div className={`${styles.label} text-gray-600`}>Secs</div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={`inline-flex items-center space-x-3 p-3 rounded-lg border ${getUrgencyColor()} ${className}`}>
      {showIcon && <Zap className={`${styles.icon} animate-pulse`} />}
      <div>
        <div className={`${styles.container} font-medium mb-1`}>Trial ends in:</div>
        {formatTime()}
      </div>
    </div>
  );
}

// Simple text version for inline use
export function TrialCountdownText({ trialEnd }: { trialEnd: string }) {
  const [timeText, setTimeText] = useState<string>('');
  const mounted = useMounted();



  useEffect(() => {
    const updateTimeText = () => {
      const endDate = new Date(trialEnd);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeText('Trial expired');
        return;
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      if (days > 0) {
        if (days === 1) {
          setTimeText(`${days} day, ${hours}h left`);
        } else {
          setTimeText(`${days} days, ${hours}h left`);
        }
      } else if (hours > 0) {
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeText(`${hours}h ${minutes}m left`);
      } else {
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeText(`${minutes}m left`);
      }
    };

    updateTimeText();
    const interval = setInterval(updateTimeText, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [trialEnd]);

  if (!mounted) {
    return null;
  }

  return <span className="font-medium">{timeText}</span>;
}