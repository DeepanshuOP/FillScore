// Motion's feature bundle (animate, exit, in-view), loaded by LazyMotion after first paint so it is not in every
// route's First Load JS. See app/providers.tsx.
import { domAnimation } from 'motion/react'

export default domAnimation
