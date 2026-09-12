import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportError } from '../lib/crashReporting';

// Catches any render-time crash below it (a bad API response shaped
// unexpectedly, a null where a listing was assumed to exist, etc.) and
// swaps in a plain recoverable screen instead of the app going to a blank
// white/black screen with no way back — this is the one piece of "graceful
// degradation" that literally cannot be built any other way in React: an
// error boundary is the only mechanism that intercepts a render-time throw
// at all, hooks or otherwise. Deliberately has no dependency on theme
// context / translations / navigation — if THOSE are what's broken, this
// still has to render something.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught render error', error, info?.componentStack);
    // The component stack is the useful half: it says which screen died,
    // which the JS stack alone often doesn't in a release build.
    reportError(error, { componentStack: info?.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={48} color="#e0245e" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            Sorry about that — please try again. If it keeps happening, restarting the app usually
            helps.
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222222',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#777777',
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#0066FF',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
