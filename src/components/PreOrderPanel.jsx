import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Package, Star, Loader } from 'lucide-react';

const PreOrderPanel = () => {
  return (
    <div className="home-dashboard">
      {/* Main Content */}
      <div className="dashboard-content">
        <motion.div
          className="card coming-soon-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="coming-soon-content">
            {/* Icon */}
            <motion.div
              className="coming-soon-icon"
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              🚀
            </motion.div>

            {/* Title */}
            <h2 className="coming-soon-title">Pre-Order Feature</h2>
            
            {/* Description */}
            <p className="coming-soon-description">
              We're working on an exciting pre-order system that will allow you to 
              reserve your favorite meals in advance. Stay tuned for updates!
            </p>

            {/* Status */}
            <div className="coming-soon-status">
              <div className="status-indicator">
                <Loader className="w-4 h-4 animate-spin" />
                <span>In Development</span>
              </div>
            </div>

            {/* Features Preview */}
            <div className="features-preview">
              <h3 className="features-title">What to Expect:</h3>
              <div className="features-list">
                <div className="feature-item">
                  <Clock className="w-5 h-5 text-primary" />
                  <span>Schedule orders in advance</span>
                </div>
                <div className="feature-item">
                  <Package className="w-5 h-5 text-primary" />
                  <span>Pickup time slots</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PreOrderPanel;
