import FormForgotPassword from "@/components/login/FormForgotPassword";
import ResetPassword from "@/components/login/Reset-password";
import VerifyPin from "@/components/login/Verify-pin";
import { useResponsive } from "@/constants/responsive";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSchoolStore } from "../../store/useSchoolStore";

const ForgotPassword = () => {
  const { scale } = useResponsive();
  const styles = useMemo(() => createStyles(scale), [scale]);

  const { school } = useSchoolStore();
  const { name, logo } = school || {};

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
              name={name}
              image={logo}
              onNext={() => setStep(2)} // cuando termine el primer formulario
            />
          )}

          {step === 2 && (
            <VerifyPin
              name={name}
              image={logo}
              onNext={() => setStep(3)} // cuando se verifique el PIN
            />
          )}

          {step === 3 && <ResetPassword name={name} image={logo} />}
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
      backgroundColor: "#dfe9ff",
    },
    authContainer: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(19),
    },
  });
}

export default ForgotPassword;
