import FormForgotPassword from "@/components/login/FormForgotPassword";
import ResetPassword from "@/components/login/Reset-password";
import VerifyPin from "@/components/login/Verify-pin";
import { useResponsive } from "@/constants/responsive";
import { AUTH_SCREEN_BACKGROUND } from "@/constants/authColors";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ForgotPassword = () => {
  const { scale } = useResponsive();
  const styles = useMemo(() => createStyles(scale), [scale]);

  // step: 1 = formulario, 2 = PIN, 3 = reset password
  const [step, setStep] = useState(1);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={{ flex: 1, width: "100%" }}
      >
        <ScrollView
          contentContainerStyle={styles.authContainer}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <FormForgotPassword
              onNext={() => setStep(2)} // cuando termine el primer formulario
            />
          )}

          {step === 2 && (
            <VerifyPin
              onNext={() => setStep(3)} // cuando se verifique el PIN
            />
          )}

          {step === 3 && <ResetPassword />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

function createStyles(scale: (size: number) => number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      width: "100%",
      backgroundColor: AUTH_SCREEN_BACKGROUND,
    },
    authContainer: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
  });
}

export default ForgotPassword;
