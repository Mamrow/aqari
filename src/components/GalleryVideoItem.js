import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// useVideoPlayer is a hook, so each gallery video needs its own component
// instance rather than being created inline inside a .map() callback.
export default function GalleryVideoItem({ uri, style }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
  });

  return (
    <VideoView
      style={[styles.video, style]}
      player={player}
      fullscreenOptions={{ enable: true }}
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  video: {
    backgroundColor: '#000',
  },
});
