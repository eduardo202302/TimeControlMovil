import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import TagOptionSheet from "../permissions/TagOptionSheet";
import {
  findCategoryIdByName,
  isAllCategorySelected,
  tagsOfCategory,
  type UserSettingKey,
} from "../../utils/userFormRules";
import type { UserCategory } from "../../utils/usersRules";
import TagCreateSheet from "./TagCreateSheet";
import TagMultiSelectSheet from "./TagMultiSelectSheet";
import type { UserFormController } from "./useUserForm";
import type { UserFormStyles } from "./userFormStyles";

interface UserSettingsTabProps {
  ctl: UserFormController;
  styles: UserFormStyles;
}

type DefField = "branchTagId" | "departmentTagId";

/** Tab "Configuración" — port de SubComponents/UserSettings. */
export default function UserSettingsTab({ ctl, styles }: UserSettingsTabProps) {
  const { form, isWatch, company, capabilities, categories, allTags } = ctl;
  const [multiCategory, setMultiCategory] = useState<UserCategory | null>(null);
  const [defTarget, setDefTarget] = useState<DefField | null>(null);
  const [createCategory, setCreateCategory] = useState<UserCategory | null>(null);

  // Mismo armado que visiblePermissions del webapp: cada toggle además
  // depende de su flag de escuela, e isCreateExcuses del rol.
  const permissions = useMemo(() => {
    const items: { key: UserSettingKey; label: string; disabled: boolean }[] = [];
    const tc = capabilities.canApplyTimeControl;
    if (tc && company.companyIsTimeControlDefault) {
      items.push({ key: "isTimeControl", label: "Time Control", disabled: isWatch });
    }
    if (tc && company.companyIsValidLocation) {
      items.push({
        key: "isValidLocation",
        label: "Validar Ubicación App",
        disabled: isWatch || !form.isTimeControl,
      });
    }
    if (tc && company.companyIsImageRequired) {
      items.push({
        key: "isImageRequired",
        label: "Requiere Imagen",
        disabled: isWatch || !form.isTimeControl,
      });
    }
    if (tc && company.companyIsWorkingLunch) {
      items.push({ key: "isWorkingLunch", label: "Trabaja Almuerzo", disabled: isWatch });
    }
    if (capabilities.canCreateExcuses) {
      items.push({ key: "isCreateExcuses", label: "Crea Excusas", disabled: isWatch });
    }
    return items;
  }, [capabilities, company, isWatch, form.isTimeControl]);

  const branchCatId = findCategoryIdByName(categories, "sucursal");
  const departmentCatId = findCategoryIdByName(categories, "departamento");
  const defCategoryId = defTarget === "branchTagId" ? branchCatId : departmentCatId;

  const defOptions = useMemo(
    () =>
      defCategoryId == null
        ? []
        : tagsOfCategory(form.tags, defCategoryId).map((tag) => ({ id: tag.id, name: tag.name })),
    [form.tags, defCategoryId],
  );

  const multiOptions = useMemo(
    () =>
      multiCategory
        ? tagsOfCategory(allTags, multiCategory.id).map((tag) => ({ id: tag.id, name: tag.name }))
        : [],
    [allTags, multiCategory],
  );

  const renderDefSelect = (label: string, field: DefField, categoryId: number | null) => {
    const selected = categoryId == null ? [] : tagsOfCategory(form.tags, categoryId);
    const value = form[field];
    const valueName = selected.find((tag) => tag.id === value)?.name;
    const disabled = isWatch || selected.length === 0;
    return (
      <View style={styles.categoryBlock}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inlineRow}>
          <TouchableOpacity
            style={[styles.select, styles.flex, disabled && styles.inputDisabled]}
            onPress={() => setDefTarget(field)}
            disabled={disabled}
            activeOpacity={0.75}
          >
            <Text style={valueName ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
              {valueName ?? `Seleccionar ${label.replace(":", "")}`}
            </Text>
            {/* Clearable, igual que el Form.Dropdown del webapp. */}
            {!disabled && value !== "" ? (
              <TouchableOpacity onPress={() => ctl.setDefTag(field, "")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <>
      {/* "Crea Excusas" es independiente de Time Control (ver
          buildUserSettingsPayload/applyRoleChange en userFormRules.ts: viaja
          y se resetea aparte de los 4 settings de TC). Antes esta card se
          ocultaba entera sin TC, dejando ese toggle inalcanzable aunque el
          rol sí lo permitiera — ahora se muestra si `permissions` tiene algo
          que ofrecer, sea por TC o por createExcuses. */}
      {permissions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="settings-outline" size={16} color="#2563EB" />
              <Text style={styles.cardTitle}>Permisos</Text>
            </View>
          </View>
          {permissions.map((permission, index) => {
            const checked = form[permission.key];
            return (
              <View
                key={permission.key}
                style={[styles.switchRow, index > 0 && styles.switchRowSpaced]}
              >
                <Text style={styles.switchLabel}>{permission.label}</Text>
                <Text style={[styles.switchValue, checked && styles.switchValueOn]}>
                  {checked ? "Sí" : "No"}
                </Text>
                <Switch
                  value={checked}
                  onValueChange={(value) => ctl.toggleSetting(permission.key, value)}
                  disabled={permission.disabled}
                />
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="business-outline" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Sucursal y Departamento</Text>
          </View>
        </View>

        {!!ctl.catalogError && <Text style={styles.notice}>{ctl.catalogError}</Text>}

        {categories.map((category, index) => {
          const selected = tagsOfCategory(form.tags, category.id);
          const allSelected = isAllCategorySelected(form, category.id, allTags);
          return (
            <View
              key={category.id}
              style={index > 0 && styles.categoryBlock}
            >
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryLabel}>{category.name}:</Text>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => ctl.selectAllCategory(category.id, !allSelected)}
                  disabled={isWatch}
                  hitSlop={6}
                >
                  <Ionicons
                    name={allSelected ? "checkbox" : "square-outline"}
                    size={18}
                    color={isWatch ? "#9CA3AF" : "#2563EB"}
                  />
                  <Text style={styles.checkboxText}>Todos</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inlineRow}>
                <TouchableOpacity
                  style={[styles.select, styles.flex, isWatch && styles.inputDisabled]}
                  onPress={() => setMultiCategory(category)}
                  disabled={isWatch}
                  activeOpacity={0.75}
                >
                  {selected.length === 0 ? (
                    <Text style={styles.selectPlaceholder} numberOfLines={1}>
                      Seleccionar {category.name}
                    </Text>
                  ) : (
                    <View style={styles.chipsWrap}>
                      {selected.map((tag) => (
                        <View key={tag.id} style={styles.chip}>
                          <Text style={styles.chipText}>{tag.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </TouchableOpacity>
                {!isWatch && (
                  // Creación inline de etiqueta (TagsCrud del webapp con la
                  // categoría bloqueada): POST /tags + autoselección.
                  <TouchableOpacity
                    style={styles.addTagBtn}
                    onPress={() => setCreateCategory(category)}
                    activeOpacity={0.8}
                    accessibilityLabel={`Agregar ${category.name}`}
                  >
                    <Ionicons name="add" size={20} color="#2563EB" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {renderDefSelect("Sucursal Def.", "branchTagId", branchCatId)}
        {renderDefSelect("Departamento Def.", "departmentTagId", departmentCatId)}
      </View>

      <TagMultiSelectSheet
        visible={multiCategory !== null}
        title={multiCategory ? `Seleccionar ${multiCategory.name}` : ""}
        options={multiOptions}
        selectedIds={
          multiCategory ? tagsOfCategory(form.tags, multiCategory.id).map((tag) => tag.id) : []
        }
        onChange={(ids) => multiCategory && ctl.setCategoryTags(multiCategory.id, ids)}
        onClose={() => setMultiCategory(null)}
      />

      <TagCreateSheet
        category={createCategory}
        onCreate={ctl.createCategoryTag}
        onClose={() => setCreateCategory(null)}
      />

      <TagOptionSheet
        visible={defTarget !== null}
        title={defTarget === "branchTagId" ? "Sucursal Def." : "Departamento Def."}
        options={defOptions}
        selectedId={defTarget && form[defTarget] !== "" ? (form[defTarget] as number) : null}
        onSelect={(tag) => {
          if (defTarget && typeof tag.id === "number") ctl.setDefTag(defTarget, tag.id);
          setDefTarget(null);
        }}
        onClose={() => setDefTarget(null)}
      />
    </>
  );
}
