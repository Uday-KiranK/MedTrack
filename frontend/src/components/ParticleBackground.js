import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

const particleHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: transparent;
      overflow: hidden;
    }
    #tsparticles {
      position: absolute;
      width: 100%;
      height: 100%;
      z-index: -1;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/tsparticles-slim@2.12.0/tsparticles.slim.bundle.min.js"></script>
</head>
<body>
  <div id="tsparticles"></div>
  <script>
    tsParticles.load("tsparticles", {
      fpsLimit: 60,
      interactivity: {
        events: {
          onClick: { enable: true, mode: "push" },
          onHover: { enable: true, mode: "grab" },
          resize: true
        },
        modes: {
          push: { quantity: 4 },
          grab: { distance: 140, links: { opacity: 0.5 } }
        }
      },
      particles: {
        color: { value: "#1A9988" },
        links: {
          color: "#1A9988",
          distance: 150,
          enable: true,
          opacity: 0.3,
          width: 1
        },
        move: {
          direction: "none",
          enable: true,
          outModes: { default: "bounce" },
          random: false,
          speed: 1,
          straight: false
        },
        number: {
          density: { enable: true, area: 800 },
          value: 40
        },
        opacity: { value: 0.4 },
        shape: { type: "circle" },
        size: { value: { min: 1, max: 3 } }
      },
      detectRetina: true
    });
  </script>
</body>
</html>
`;

export default function ParticleBackground() {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container} pointerEvents="none">
         <iframe 
           srcDoc={particleHtml} 
           style={{ width: '100%', height: '100%', border: 'none' }}
         />
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html: particleHtml }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1, // places it behind all other react native layers
    backgroundColor: '#F5F7FA', // matches COLORS.background
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent'
  }
});
