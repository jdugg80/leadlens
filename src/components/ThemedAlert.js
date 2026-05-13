import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../constants';

let activeHost = null;

function normalizeArgs(title, message, buttons, options) {
  const finalTitle = String(title || 'Notice');
  const finalMessage = typeof message === 'string' ? message : '';
  const finalButtons = Array.isArray(buttons) && buttons.length
    ? buttons
    : [{ text: 'OK' }];
  const finalOptions = options || {};
  return {
    visible: true,
    title: finalTitle,
    message: finalMessage,
    buttons: finalButtons,
    options: finalOptions,
  };
}

export function showThemedAlert(title, message, buttons, options) {
  const args = normalizeArgs(title, message, buttons, options);
  if (!activeHost) {
    const mapped = (args.buttons || [{ text: 'OK' }]).map((b) => ({
      text: b?.text || 'OK',
      style: b?.style,
      onPress: b?.onPress,
    }));
    Alert.alert(args.title, args.message, mapped);
    return;
  }
  activeHost(args);
}

export function ThemedAlertHost() {
  const [config, setConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [{ text: 'OK' }],
    options: {},
  });

  useEffect(() => {
    activeHost = setConfig;
    return () => {
      if (activeHost === setConfig) activeHost = null;
    };
  }, []);

  const close = (button) => {
    const onPress = button?.onPress;
    setConfig((prev) => ({ ...prev, visible: false }));
    if (typeof onPress === 'function') {
      setTimeout(() => {
        try { onPress(); } catch {}
      }, 70);
    }
  };

  const buttons = useMemo(() => (Array.isArray(config.buttons) && config.buttons.length ? config.buttons : [{ text: 'OK' }]), [config.buttons]);
  const cancelable = config?.options?.cancelable !== false;

  return (
    <Modal
      visible={!!config.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (cancelable) close(buttons[buttons.length - 1]);
      }}
    >
      <Pressable
        style={s.backdrop}
        onPress={() => {
          if (cancelable) close(buttons[buttons.length - 1]);
        }}
      >
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.cornerTL} />
          <View style={s.cornerBR} />
          <Text style={s.title}>{config.title || 'Notice'}</Text>
          {!!config.message ? <Text style={s.message}>{config.message}</Text> : null}
          <View style={s.divider}>
            <View style={s.dividerL} />
            <View style={s.dividerR} />
          </View>
          <View style={[s.buttonRow, buttons.length > 2 && s.buttonColumn]}>
            {buttons.map((button, index) => {
              const isCancel = button?.style === 'cancel';
              const isDestructive = button?.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${button?.text || 'button'}-${index}`}
                  style={[
                    s.button,
                    isCancel && s.buttonCancel,
                    isDestructive && s.buttonDestructive,
                    buttons.length > 2 && s.buttonFull,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => close(button)}
                >
                  <Text
                    style={[
                      s.buttonText,
                      isCancel && s.buttonTextCancel,
                      isDestructive && s.buttonTextDestructive,
                    ]}
                  >
                    {button?.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,8,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 18,
    height: 18,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: COLORS.accent,
    opacity: 0.85,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 18,
    height: 18,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.accent2,
    opacity: 0.85,
  },
  title: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 8,
    paddingRight: 16,
  },
  message: {
    color: COLORS.textDim,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  divider: {
    flexDirection: 'row',
    height: 2,
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: COLORS.border,
  },
  dividerL: { flex: 1, backgroundColor: COLORS.purple, opacity: 0.85 },
  dividerR: { flex: 1, backgroundColor: COLORS.accent2, opacity: 0.85 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  buttonColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  button: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    backgroundColor: COLORS.accent + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: { width: '100%' },
  buttonCancel: {
    borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface2,
  },
  buttonDestructive: {
    borderColor: COLORS.danger + '55',
    backgroundColor: COLORS.danger + '16',
  },
  buttonText: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonTextCancel: { color: COLORS.text },
  buttonTextDestructive: { color: COLORS.danger },
});
