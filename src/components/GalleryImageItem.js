import SkeletonImage from './SkeletonImage';

export default function GalleryImageItem({ uri, style, colors }) {
  return <SkeletonImage uri={uri} style={style} colors={colors} />;
}
