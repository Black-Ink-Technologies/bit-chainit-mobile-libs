
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNMobileSpec.h"

@interface Mobile : NSObject <NativeMobileSpec>
#else
#import <React/RCTBridgeModule.h>

@interface Mobile : NSObject <RCTBridgeModule>
#endif

@end
