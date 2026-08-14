import { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { isVideoUrl } from '../utils/media';
import GalleryVideoItem from './GalleryVideoItem';

const ITEM_HEIGHT = Dimensions.get('window').height * 0.6;
// A visible gap between photos, plus the snap/counter below, is what
// actually makes it obvious this is several photos and not one continuous
// image — a plain edge-to-edge scroll on a solid black background gave no
// visual cue at all where one photo ended and the next began.
const ITEM_GAP = 10;
const ITEM_STRIDE = ITEM_HEIGHT + ITEM_GAP;

// Full-screen "scroll through everything, one under another" viewer, opened
// by tapping any thumbnail in the listing detail's preview strip. Backed by a
// FlatList (not a ScrollView) so items outside the viewport aren't mounted —
// a video item only starts buffering once it's actually scrolled near.
// topInset is passed in from the screen that opens this (computed there via
// useSafeAreaInsets in the normal component tree) rather than read with the
// hook in here — react-native-safe-area-context can't see the real notch/
// Dynamic Island inset from inside RN's <Modal>, since it renders through
// its own separate native window on iOS. Reading it here silently came back
// as 0, which is why the close button and photo counter used to render
// right at the physical top edge — behind the notch, and not tappable.
export default function MediaGalleryModal({ visible, media, initialIndex, onClose, topInset = 0 }) {
  const t = useT();
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.container, { paddingTop: topInset }]}>
        <FlatList
          ref={listRef}
          data={media}
          keyExtractor={(uri) => uri}
          initialScrollIndex={initialIndex}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // Snaps cleanly to exactly one photo at a time, same idea as a
          // paged carousel — without this the scroll drifts freely and two
          // photos can sit half-visible on screen together.
          snapToInterval={ITEM_STRIDE}
          decelerationRate="fast"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          getItemLayout={(_, index) => ({
            length: ITEM_STRIDE,
            offset: ITEM_STRIDE * index,
            index,
          })}
          // Keep the render window tight — this is full-screen items, some of
          // them live video players, so the default (several screens ahead)
          // would start buffering far more videos than are actually visible.
          initialNumToRender={2}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          renderItem={({ item: uri }) =>
            isVideoUrl(uri) ? (
              <GalleryVideoItem uri={uri} style={styles.item} />
            ) : (
              <Image source={{ uri }} style={styles.item} resizeMode="contain" />
            )
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11yCloseGallery')}
          testID="gallery-close"
          style={[styles.closeButton, { top: topInset + 16 }]}
          onPress={onClose}
          hitSlop={16}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {media.length > 1 && (
          <View style={[styles.counter, { top: topInset + 16 }]}>
            <Text style={styles.counterText}>
              {activeIndex + 1} / {media.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  item: {
    width: '100%',
    height: ITEM_HEIGHT,
  },
  separator: {
    height: ITEM_GAP,
    backgroundColor: '#2c2c2c',
  },
  closeButton: {
    position: 'absolute',
    start: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
